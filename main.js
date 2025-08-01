function populateRankingDates() {
    let months = [3,6,9,12];
    let currentYear = new Date().getFullYear();
    let years = [currentYear - 1, currentYear, currentYear + 1];
    let wednesdays = new Map();
    let smallestDaysDiff = 365*2;
    let selectedWednesday = null;

    years.forEach(year => {
        months.forEach(month => {
            let searchDate = new Date(year,month-1,1);
            while (searchDate.getDay() !== 3) {
                searchDate.setDate(searchDate.getDate() + 1);
            }

            let daysAge = daysDiff(searchDate,new Date());

            if (daysAge <= 365 && daysAge >= -90) {
                let wedString = getStandardDateString(searchDate);
                wednesdays.set(wedString, `Q${months.indexOf(month) + 1} ${year} (${wedString})`);
                
                if (Math.abs(daysAge) < smallestDaysDiff)
                    {
                        smallestDaysDiff = Math.abs(daysAge);
                        selectedWednesday = wedString;
                    }
            }         
        });
    });

    let $dropdown = $("#date");

    wednesdays.forEach((text, wedString) => {
        $dropdown.append($("<option />").val(wedString).text(text));
    });

    let todayString = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;
    $dropdown.append($("<option />").val(todayString).text("Today (" + todayString + ")"));
    $dropdown.val(selectedWednesday);
}

function renderRatio (data) 
{ 
    if (data) {
        let rounded = data.toFixed(2);
        if (!config.ratio_cap)
            return rounded;
        if (data > config.ratio_cap)
            return rounded + " (" + config.ratio_cap.toFixed(2) + ")";
        if (data < 1/config.ratio_cap)
            return rounded + " (" + (1/config.ratio_cap).toFixed(2) + ")";
        return rounded;
    } else {
        return "";
    }
}

function teamDetailsModal() {
    var teamChart;
    var teamGameHistoryDt;
    let $teamDetailModal = $('#teamDetailModal');

    $('#mrdaRankingPointsContainer').on('click', 'td.dt-teamDetailsClick', function (e) {
        let tr = e.target.closest('tr');
        let row = $('#mrdaRankingPoints').DataTable().row(tr);
        let team = row.data();

        $('#teamName').text(team.teamName);
        $('#teamAverageRankingPoints').text(team.averageRankingPoints.toFixed(2));

        teamChart = new Chart(document.getElementById("teamChart"), {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Game Ranking Points',
                    data: Array.from(team.gameHistory, (game) => ({ 
                        x: new Date(game.date), 
                        y: game.rankingPoints[team.teamId], 
                        label: getStandardDateString(game.date) + (game.homeTeamId == team.teamId ? 
                            " vs. " + apiTeams[game.awayTeamId].teamName : " @ " + apiTeams[game.homeTeamId].teamName) })),
                    showLine: false
                }, {
                    label: 'Average Ranking Points',
                    data: Array.from(team.averageRankingPointsHistory, ([date, arp]) => ({ x: new Date(date), y: arp, label: date })),
                    showLine: true
                }],
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return context[0].raw.label;
                            }
                        }
                    }
                }
            }
        });

        teamGameHistoryDt = new DataTable('#teamGameHistory', {
            columns: [
                { name: 'date', data: 'date'},
                { data: 'score' },
                { data: 'expectedRatio', render: renderRatio},
                { data: 'actualRatio', render: renderRatio},
                { data: 'gameRankingPoints', render: function (data, type, full) { return data ? data.toFixed(2) : ""; }, className: 'border-left'},
                { data: 'averageRankingPoints', render: function (data, type, full) { return data ? data.toFixed(2) : ""; }}
            ],
            data: Array.from(team.gameHistory, (game) => ({ 
                date: getStandardDateString(game.date),
                score: game.scores[team.teamId] + "-" + (game.homeTeamId == team.teamId ? 
                    game.scores[game.awayTeamId] + " vs. " + apiTeams[game.awayTeamId].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " ") 
                    : game.scores[game.homeTeamId] + " @ " + apiTeams[game.homeTeamId].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " ")),
                expectedRatio: game.expectedRatios[team.teamId],
                actualRatio: !game.forfeit ? asympRatio(game.scores[team.teamId],(game.homeTeamId == team.teamId ? game.scores[game.awayTeamId] : game.scores[game.homeTeamId])) : "",
                gameRankingPoints: game.rankingPoints[team.teamId],
                averageRankingPoints: team.getAverageRankingPointHistory(game.date)
            })),
            lengthChange: false,
            searching: false,
            info: false,
            order: {
                name: 'date',
                dir: 'desc'
            },
            ordering: {
                handler: false
            },
        });

        $teamDetailModal.modal('show');
    });

    $teamDetailModal.on('hidden.bs.modal', function (event) {
        $('#teamName').text('');
        $('#teamAverageRankingPoints').text('');
        teamChart.destroy();
        teamGameHistoryDt.clear();
        teamGameHistoryDt.destroy();
    });

}

function displayRankingChart(teamsArray, calcDate) {

    let rankingChart = Chart.getChart("rankingsChart");
    if (rankingChart != undefined) {
        rankingChart.destroy();
    }

    let dateCalc = calcDate ? new Date(calcDate) : new Date();
    let dateMax = getStandardDateString(dateCalc);
    dateCalc.setFullYear(dateCalc.getFullYear() - 1)
    dateCalc.setDate(dateCalc.getDate() + 1);
    let dateMin = getStandardDateString(dateCalc);

    let datasets = [];

    teamsArray.sort((a, b) => a.rankingSort - b.rankingSort).forEach(team => {
        if (team.chart) {
            datasets.push({
                label: team.teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " "),
                data: Array.from(team.averageRankingPointsHistory, ([date, arp]) => ({ x: new Date(date), y: arp, teamName: team.teamName })),
                showLine: true
            });
        }
    });

    rankingChart = new Chart(document.getElementById("rankingsChart"), {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        min: new Date(dateMin),
                        max: new Date(dateMax)
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return context[0].raw.teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " ");
                            },
                            label: function(context) {
                                return getStandardDateString(context.raw.x) + ": " + context.raw.y.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
}

function averageFromArray(array) {
    var total = 0;
    for(var i = 0; i < array.length; i++) {
        total += array[i];
    }
    return total / array.length;
}

function meanAbsoluteLogErrorPercent(absLogErrorArray) {
    let meal = averageFromArray(absLogErrorArray);
    let errorPct = (Math.exp(meal) - 1) * 100;
    return errorPct.toFixed(2) + '%';
}

function calculateAndDisplayRankings() {

    let mrdaRankingPointSystem = new MrdaRankingPointsSystem(apiTeams);

    mrdaRankingPointSystem.updateRankings(groupedApiGames, $("#date").val());

    mrdaRankingPointSystem.calculateAverageRankingPoints($("#date").val(), true, null, $("#date").val());

    mrdaRankingPointSystem.rankTeams();

    $("#ratioCapGames").text('Impacts ' + mrdaRankingPointSystem.ratioCapGames + ' games (' + ((mrdaRankingPointSystem.ratioCapGames/mrdaRankingPointSystem.totalGames) * 100).toFixed(2) + '%)');
    $("#gpxGames").text('Impacts ' + mrdaRankingPointSystem.gpxGames + ' games (' + ((mrdaRankingPointSystem.gpxGames/mrdaRankingPointSystem.totalGames) * 100).toFixed(2) + '%)');
    $("#bothRatioCapGames").text('Impacts ' + mrdaRankingPointSystem.bothRatioCapGames + ' games (' + ((mrdaRankingPointSystem.bothRatioCapGames/mrdaRankingPointSystem.totalGames) * 100).toFixed(2) + '%)');

    if (mrdaRankingPointSystem.absoluteLogErrors.length > 0)
    {
        let $pctErrorDiv = $('#pctErrorMeal');
        $pctErrorDiv.html("Percent Error using Mean Absolute Log Error: <br />");
        if (mrdaRankingPointSystem.absoluteLogErrors_2024_Q4.length > 0)
            $pctErrorDiv.append("2024 Q4: " + meanAbsoluteLogErrorPercent(mrdaRankingPointSystem.absoluteLogErrors_2024_Q4) + "<br />");        
        if (mrdaRankingPointSystem.absoluteLogErrors_2025_Q1.length > 0)
            $pctErrorDiv.append("2025 Q1: " + meanAbsoluteLogErrorPercent(mrdaRankingPointSystem.absoluteLogErrors_2025_Q1) + "<br />");
        if (mrdaRankingPointSystem.absoluteLogErrors_2025_Q2.length > 0)
            $pctErrorDiv.append("2025 Q2: " + meanAbsoluteLogErrorPercent(mrdaRankingPointSystem.absoluteLogErrors_2025_Q2) + "<br />");
        if (mrdaRankingPointSystem.absoluteLogErrors_2025_Q3.length > 0)
            $pctErrorDiv.append("2025 Q3: " + meanAbsoluteLogErrorPercent(mrdaRankingPointSystem.absoluteLogErrors_2025_Q3) + "<br />");
        $pctErrorDiv.append("Total: " + meanAbsoluteLogErrorPercent(mrdaRankingPointSystem.absoluteLogErrors));
    }
    
    displayRankingChart(Object.values(mrdaRankingPointSystem.mrdaTeams), $("#date").val());

    let regenerate = DataTable.isDataTable('#mrdaRankingPoints');

    if (regenerate)
        $('#mrdaRankingPoints').DataTable().clear().destroy();        
    

    new DataTable('#mrdaRankingPoints', {
        columns: [
            { name: 'rankingSort', data: 'rankingSort', visible: false},
            { title: 'Position', data: 'ranking', className: 'dt-teamDetailsClick' },
            { title: 'Team', data: 'teamName', className: 'dt-teamDetailsClick' },
            { title: 'Average Ranking Points', data: 'averageRankingPoints', render: function (data, type, full) { return data.toFixed(2); }, className: 'dt-teamDetailsClick' },
            { title: 'Games Count',  data: 'activeStatusGameCount', className: 'dt-teamDetailsClick'},
            { title: 'Postseason Eligible', data: 'postseasonEligible', render: function (data, type, full) { return data ? 'Yes' : 'No'; }, className: 'dt-teamDetailsClick'},
            { title: "Chart", data: 'chart', render: function (data, type, full) { return "<input type='checkbox' class='chart' " + (data ? "checked" : "") + "></input>"; }}
        ],
        data: Object.values(mrdaRankingPointSystem.mrdaTeams),
        paging: false,
        searching: false,
        info: false,
        order: {
            name: 'rankingSort',
            dir: 'asc'
        },
        ordering: {
            handler: false
        }
    });
    
    if (!regenerate) {
        $("#mrdaRankingPointsContainer").on('change', 'input.chart', function (e) {
            let tr = e.target.closest('tr');
            let dt = $('#mrdaRankingPoints').DataTable();
            let row = dt.row(tr);
            let team = row.data();
            team.chart = $(this).prop('checked');
            displayRankingChart(dt.rows().data().toArray(), $("#date").val());
        });
    }
}

function setupConfigInputs(changeCallback) {
    $("#config input").each(function() {
        let $this = $(this);
        let val = config[$this.attr('id')];
        if ($this.attr('type') == 'checkbox') {
            $this.prop('checked', val);
        } else {
            $this.val(val);
        }
    }).on('change', function() {
        let $this = $(this);
        if ($this.attr('type') == 'checkbox') {
            config[$this.attr('id')] = $this.prop('checked');
        } else {
            config[$this.attr('id')] = parseFloat($this.val());
        }
        changeCallback();
    });
}

function setupApiGames() {
    var apiGamesDt = new DataTable('#apiGames', {
            columns: [
                { title: "Date", name: 'date', data: 'date', render: getStandardDateString},
                { title: "Home Team", data: 'homeTeamId', render: function (data) { return apiTeams[data].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " "); } },
                { title: "Home Score", data: 'homeTeamScore', render: function(data, type, full) { return data + (full.forfeit ? "*" : ""); }},
                { title: "Away Score", data: 'awayTeamScore', render: function(data, type, full) { return data + (full.forfeit ? "*" : ""); }} ,
                { title: "Away Team", data: 'awayTeamId', render: function (data) { return apiTeams[data].teamName.replaceAll("Roller Derby", "").replaceAll("Derby", "").replaceAll("  ", " "); } },
                { title: "Event Name", data: 'eventName'},
                { title: "Type", render: function (data, type, full) { return full.championship ? "Championship" : full.qualifier ? "Qualifier" : "Regular Season"; }},
                { title: "Validated", data: 'validated'},
                { title: "Excluded", render: function (data, type, full) { return "<input type='checkbox' class='excluded'></input>"; }}
            ],
            data: [...groupedApiGames.values()].flat(1),
            lengthChange: false,
            order: {
                name: 'date',
                dir: 'desc'
            }
        });

    $("#apiGames").on('change', 'input.excluded', function (e) {
        let tr = e.target.closest('tr');
        let row = apiGamesDt.row(tr);
        let game = row.data();
        game.excluded = $(this).prop('checked');
        calculateAndDisplayRankings();
    });
}

function setupApiTeams() {
    var apiTeamsDt = new DataTable('#apiTeams', {
            columns: [
                { title: "Team", data: 'teamName'},
                { title: "Distance Clause Applies", data: 'distanceClauseApplies'},
                { title: "Initial Ranking", data: 'initialRanking', render: function (data, type, full) { return "<div class='hiddenInitialRanking' style='display: none;'>" + data + "</div><input type='number' class='initialRanking' min='1' value='" + data + "'></input>"; }}
            ],
            data: Object.values(apiTeams),
            lengthChange: false
        });

    $("#apiTeams").on('change', 'input.initialRanking', function (e) {
        let tr = e.target.closest('tr');
        let row = apiTeamsDt.row(tr);
        let team = row.data();
        team.initialRanking = parseInt($(this).val());
        $(tr).find('.hiddenInitialRanking').val(team.initialRanking);
        calculateAndDisplayRankings();
    });
}


async function main() {

    //document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    populateRankingDates();

    await buildTeamsAndGames();

    calculateAndDisplayRankings();

    setupConfigInputs(calculateAndDisplayRankings);

    teamDetailsModal();

    setupApiGames();

    setupApiTeams();

    $("#date").on( "change", calculateAndDisplayRankings );
}

window.addEventListener('load', main);