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

            if (daysAge <= 180 && daysAge >= -90) {
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
        if (data > config.ratio_cap)
            return rounded + " (" + config.ratio_cap.toFixed(2) + ")";
        if (data < 1/config.ratio_cap)
            return rounded + " (" + (1/config.ratio_cap).toFixed(2) + ")";
        return rounded;
    } else {
        return "";
    }
}

function generateTeamDetails(team) {
    $("#" + team.teamId + "-title").text(team.teamName); 
    $("#" + team.teamId + "-averageRankingPoints").text(team.averageRankingPoints.toFixed(2)); 

    new Chart(document.getElementById(team.teamId + "-chart"), {
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

    new DataTable('#' + team.teamId + "-games", {
        columns: [
            { name: 'date', title: 'Date', data: 'date' },
            { title: 'Score', data: 'score' },
            { title: 'Expected Ratio', data: 'expectedRatio', render: renderRatio },
            { title: 'Actual Ratio',  data: 'actualRatio', render: renderRatio},
            { title: 'Game Ranking Points', data: 'gameRankingPoints', render: function (data, type, full) { return data ? data.toFixed(2) : ""; }},
            { title: 'Average Ranking Points', data: 'averageRankingPoints', render: function (data, type, full) { return data ? data.toFixed(2) : ""; }}
        ],
        data: Array.from(team.gameHistory, (game) => ({ 
            date: getStandardDateString(game.date),
            score: game.scores[team.teamId] + (game.homeTeamId == team.teamId ? 
                " vs. " + game.scores[game.awayTeamId] + " " + apiTeams[game.awayTeamId].teamName 
                : " @ " + game.scores[game.homeTeamId] + " " + apiTeams[game.homeTeamId].teamName),
            expectedRatio: game.expectedRatios[team.teamId],
            actualRatio: !game.forfeit ? game.scores[team.teamId]/(game.homeTeamId == team.teamId ? game.scores[game.awayTeamId] : game.scores[game.homeTeamId]) : "",
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
    });        
}

function calculateAndDisplayRankings() {

    let mrdaRankingPointSystem = new MrdaRankingPointsSystem(apiTeams);

    mrdaRankingPointSystem.updateRankings(groupedApiGames, $("#date").val());

    mrdaRankingPointSystem.calculateAverageRankingPoints($("#date").val(), true, null, $("#date").val());

    mrdaRankingPointSystem.rankTeams();

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
            { title: 'Postseason Eligible', data: 'postseasonEligible', render: function (data, type, full) { return data ? 'Yes' : 'No'; }, className: 'dt-teamDetailsClick'}
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
        $('#mrdaRankingPoints').on('click', 'td.dt-teamDetailsClick', function (e) {
            let tr = e.target.closest('tr');
            let row = $('#mrdaRankingPoints').DataTable().row(tr);
    
            if (row.child.isShown()) {
                // This row is already open - close it
                row.child.hide();
            }
            else {
                //hide any others that are open
                $("tr.dt-hasChild").each(function() {
                    $('#mrdaRankingPoints').DataTable().row(this).child.hide();
                })

                let team = row.data();
                // Open this row
                row.child($("#teamDetailContent").html().replaceAll("teamId-", team.teamId + "-")).show();

                generateTeamDetails(team);
            }
        });
    }
}


async function main() {

    populateRankingDates();

    await buildTeamsAndGames();

    calculateAndDisplayRankings();

    $("#date").on( "change", calculateAndDisplayRankings );
}

window.addEventListener('load', main);