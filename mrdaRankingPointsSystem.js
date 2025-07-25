class MrdaGame {
    constructor(apiGame) {
        this.date = apiGame.date;
        this.homeTeamId = apiGame.homeTeamId;
        this.awayTeamId = apiGame.awayTeamId;
        this.scores = {};
        this.scores[this.homeTeamId] = apiGame.homeTeamScore;
        this.scores[this.awayTeamId] = apiGame.awayTeamScore;        
        this.forfeit = apiGame.forfeit;
        this.eventName = apiGame.eventName;
        this.championship = apiGame.championship;
        this.qualifier = apiGame.qualifier;
        this.expectedRatios = {};
        this.rankingPoints = {};
    }
}

class MrdaTeam {
    constructor(apiTeam) {
        this.teamId = apiTeam.teamId;
        this.teamName = apiTeam.teamName;
        this.distanceClauseApplies = apiTeam.distanceClauseApplies;
        this.gameHistory = []
        this.activeStatusGameCount = 0;
        this.averageRankingPoints = apiTeam.initialRanking;
        this.averageRankingPointsHistory = new Map();
        this.ranking = null;
        this.rankingSort = null;
        this.postseasonEligible = false;
        this.chart = false;
    }

    getAverageRankingPointHistory(date) {
        let searchDate = new Date(date);
        
        while(!this.averageRankingPointsHistory.has(getStandardDateString(searchDate)) ) {
            searchDate.setDate(searchDate.getDate() + 1);
        }
        return this.averageRankingPointsHistory.get(getStandardDateString(searchDate))
    }
}


function ratioCap(ratio) {
    if (!config.ratio_cap)
        return ratio;
    if (ratio > config.ratio_cap)
        return config.ratio_cap;
    if (ratio < 1/config.ratio_cap)
        return 1/config.ratio_cap;
    return ratio;
}

function getStandardDateString(date) {
    let dt = new Date(date);
    return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

// Define the number of milliseconds in one day
const dayInMilliseconds = 1000 * 60 * 60 * 24;

function daysDiff(startDate, endDate) {
    
    // Convert to dates and remove time
    let dateStart = new Date(new Date(startDate).toDateString());
    let dateEnd = new Date(new Date(endDate).toDateString());
    
    // Calculate the difference in milliseconds
    let diffInMilliseconds = dateEnd.getTime() - dateStart.getTime();

    // Calculate the number of days and round to the nearest whole number
    return Math.round(diffInMilliseconds / dayInMilliseconds);;
}

function weightedGeometricMeanLog(weightedGameRankingPoints) {
    let sumOfLogProducts = 0;
    let sumOfWeights = 0;
    weightedGameRankingPoints.forEach(weightedGrp => {
        sumOfLogProducts += weightedGrp.weight * Math.log(weightedGrp.gameRankingPoints);
        sumOfWeights += weightedGrp.weight;
    });
    return Math.exp(sumOfLogProducts / sumOfWeights);
}

function weightedGeometricMean(weightedGameRankingPoints) {
    let productOfGrpsWithWeightExponent = 1;
    let sumOfWeights = 0;
    weightedGameRankingPoints.forEach(weightedGrp => {
        productOfGrpsWithWeightExponent *= Math.pow(weightedGrp.gameRankingPoints, weightedGrp.weight);
        sumOfWeights += weightedGrp.weight;
    });
    return Math.pow(productOfGrpsWithWeightExponent, (1/sumOfWeights));
}

function asympRatio(numerator, denominator) {
    if (config.log_ratio_steepness <= 0 || config.ratio_cap <= 1)
        return numerator/denominator;

    let limit = config.ratio_cap; //must be greater than 1
    let steepness = config.log_ratio_steepness //must be greater than 0

    if (denominator == 0)
        throw new Error('Divide by zero error');

    let rawRatio = numerator / denominator;
    let logRatio = Math.log(rawRatio);

    //Increase steepness by scaling input to tanh
    let squashedLog = Math.tanh(steepness * logRatio) * Math.log(limit);

    return Math.exp(squashedLog);
}

const q3_2024_deadline = new Date (2024, 9 - 1, 4);
const q4_2024_deadline = new Date (2024, 12 - 1, 4);
const q1_2025_deadline = new Date (2025, 3 - 1, 5);
const q2_2025_deadline = new Date (2025, 6 - 1, 4);
const q3_2025_deadline = new Date (2025, 9 - 1, 3);

class MrdaRankingPointsSystem {
    constructor(apiTeams) {
        this.mrdaTeams = {};
        Object.keys(apiTeams).forEach(teamId => this.mrdaTeams[teamId] = new MrdaTeam(apiTeams[teamId]));
        this.absoluteLogErrors = [];
        this.absoluteLogErrors_2024_Q4 = [];                
        this.absoluteLogErrors_2025_Q1 = [];
        this.absoluteLogErrors_2025_Q2 = [];        
        this.absoluteLogErrors_2025_Q3 = [];            
        this.totalGames = 0;
        this.ratioCapGames = 0;
        this.bothRatioCapGames = 0;
        this.gpxGames = 0;
    }

    calculateGameRankingPoints(apiGame) {
        let mrdaGame = new MrdaGame(apiGame);
        
        let homeArp = this.mrdaTeams[mrdaGame.homeTeamId].averageRankingPoints;
        let awayArp = this.mrdaTeams[mrdaGame.awayTeamId].averageRankingPoints;
        
        mrdaGame.expectedRatios[mrdaGame.homeTeamId] = asympRatio(homeArp,awayArp);
        mrdaGame.expectedRatios[mrdaGame.awayTeamId] = asympRatio(awayArp,homeArp);

        if (!mrdaGame.forfeit) {
            
            this.totalGames++;
            
            let rawHomeExpectedRatio = homeArp/awayArp;
            let rawHomeActualRatio = mrdaGame.scores[mrdaGame.homeTeamId]/mrdaGame.scores[mrdaGame.awayTeamId];
            let rawAwayExpectedRatio = awayArp/homeArp;
            let rawAwayActualRatio = mrdaGame.scores[mrdaGame.awayTeamId]/mrdaGame.scores[mrdaGame.homeTeamId];

            if (config.ratio_cap && (rawHomeActualRatio > config.ratio_cap || rawAwayActualRatio > config.ratio_cap))
                this.ratioCapGames++;

            if (config.ratio_cap 
                && ((rawHomeExpectedRatio > config.ratio_cap && rawHomeActualRatio > config.ratio_cap)
                || (rawAwayExpectedRatio > config.ratio_cap && rawAwayActualRatio > config.ratio_cap)))
                this.bothRatioCapGames++;

            if(!(config.ratio_cap && config.exclude_gp_over_cap
                && ((rawHomeExpectedRatio > config.ratio_cap && rawHomeActualRatio > config.ratio_cap)
                || (rawAwayExpectedRatio > config.ratio_cap && rawAwayActualRatio > config.ratio_cap)))) {

                let homeScoreRatio = asympRatio(mrdaGame.scores[mrdaGame.homeTeamId],mrdaGame.scores[mrdaGame.awayTeamId]);
                let awayScoreRatio = asympRatio(mrdaGame.scores[mrdaGame.awayTeamId],mrdaGame.scores[mrdaGame.homeTeamId]);

                if (config.gpx_cap && (ratioCap(homeScoreRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.homeTeamId]) > config.gpx_cap
                                    || ratioCap(awayScoreRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.awayTeamId]) > config.gpx_cap))
                {
                    mrdaGame.rankingPoints[mrdaGame.homeTeamId] = homeArp * Math.min(config.gpx_cap, Math.max(1/config.gpx_cap, ratioCap(homeScoreRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.homeTeamId])));
                    mrdaGame.rankingPoints[mrdaGame.awayTeamId] = awayArp * Math.min(config.gpx_cap, Math.max(1/config.gpx_cap, ratioCap(awayScoreRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.awayTeamId])));
                    this.gpxGames++;
                    //console.log("GPX Cap Game: " + mrdaGame.date + " " + this.mrdaTeams[mrdaGame.homeTeamId].teamName + " vs. " + this.mrdaTeams[mrdaGame.awayTeamId].teamName);
                } else {
                    mrdaGame.rankingPoints[mrdaGame.homeTeamId] = homeArp * ratioCap(homeScoreRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.homeTeamId]);
                    mrdaGame.rankingPoints[mrdaGame.awayTeamId] = awayArp * ratioCap(awayScoreRatio)/ratioCap(mrdaGame.expectedRatios[mrdaGame.awayTeamId]);                
                }

                let gameDate = new Date(mrdaGame.date);

                if (gameDate > q3_2024_deadline) {
                    let absLogError = Math.abs(Math.log(rawHomeExpectedRatio/rawHomeActualRatio));
                    this.absoluteLogErrors.push(absLogError);
                    if (q3_2024_deadline < gameDate && gameDate < q4_2024_deadline)
                        this.absoluteLogErrors_2024_Q4.push(absLogError);                                    
                    if (q4_2024_deadline < gameDate && gameDate < q1_2025_deadline)
                        this.absoluteLogErrors_2025_Q1.push(absLogError);
                    if (q1_2025_deadline < gameDate && gameDate < q2_2025_deadline)
                        this.absoluteLogErrors_2025_Q2.push(absLogError);
                    if (q2_2025_deadline < gameDate && gameDate < q3_2025_deadline)
                        this.absoluteLogErrors_2025_Q3.push(absLogError);
                }
            }
        }

        this.mrdaTeams[mrdaGame.homeTeamId].gameHistory.push(mrdaGame);
        this.mrdaTeams[mrdaGame.awayTeamId].gameHistory.push(mrdaGame);
    }

    calculateAverageRankingPoints(calcDate, finalCalc, teamIds) {
        if (!teamIds) 
            teamIds = Object.keys(this.mrdaTeams);

        teamIds.forEach(teamId => {
            let team = this.mrdaTeams[teamId];
            let weightedGameRankingPoints = [];
            team.gameHistory.forEach(game => {
                let ageDays = daysDiff(game.date, calcDate);
                if (ageDays < 0 || ageDays >= 365)
                    return;

                //calculate Active Status Game Counts for final calculation.
                if (finalCalc) {
                    if (game.championship && ageDays >= 183) {
                        //championships do not count for active status past 6 months

                        //depricate playoffs per Active Status logic for final calculation. 
                        //Playoffs are last season, anything else in the rankings period is regular season.
                        if (config.exclude_postseason_in_final_calc)
                            return;
                    } else if (game.qualifier && ageDays >= 271) {
                        //qualifiers do not count for active status past 9 months
                        
                        //depricate playoffs per Active Status logic for final calculation.
                        //Playoffs are last season, anything else in the rankings period is regular season.
                        if (config.exclude_postseason_in_final_calc)
                            return;
                    } else if (game.forfeit 
                        && ((game.scores[game.homeTeamId] > 0 && game.homeTeamId == teamId) 
                        || (game.scores[game.awayTeamId] > 0 && game.awayTeamId == teamId))) {
                        team.activeStatusGameCount ++;
                    } else {
                        team.activeStatusGameCount ++;
                    }
                }

                if (config.postseason_game_decay) {
                    if (game.championship && ageDays >= 183)
                        return;
                    if (game.qualifier && ageDays >= 271)
                        return;
                }

                //do nothing if we don't have ranking points for the game. e.g. forfeits or exclude_gp_over_cap
                if (!(teamId in game.rankingPoints))
                    return;

                let gameRankingPoints = game.rankingPoints[teamId];
                let weight = 1;
                //if (new Date(game.date).getFullYear() < new Date(calcDate).getFullYear())
                //    weight = 0.1;

                if (183 <= ageDays && ageDays < 270) {
                    weight = 0.5;
                } else if (271 <= ageDays) {
                    weight = 0.25;
                }

                weightedGameRankingPoints.push({"gameRankingPoints": gameRankingPoints, "weight": weight});
            });
            if(weightedGameRankingPoints.length) {
                let averageRankingPoints = weightedGeometricMean(weightedGameRankingPoints);
                if (team.averageRankingPoints != averageRankingPoints) {
                    team.averageRankingPoints = averageRankingPoints;
                    team.averageRankingPointsHistory.set(getStandardDateString(calcDate), averageRankingPoints);
                }
            }
        });
    }

    updateRankings(groupedApiGames, calcDate) {        
        let groupedGames = [...groupedApiGames.values()];
        for (let i = 0; i < groupedGames.length; i++) {
            let gameGroup = groupedGames[i];
            let eventStartDate = gameGroup[0].date;
            if (daysDiff(eventStartDate, calcDate) < 0)
                continue;
            let eventEndDate = gameGroup[gameGroup.length - 1].date;

            let playingTeamIds = [];
            gameGroup.forEach(game => {
                if (daysDiff(game.date, calcDate) >= 0 && !game.excluded) {
                    if (!playingTeamIds.includes(game.homeTeamId)) 
                        playingTeamIds.push(game.homeTeamId);
                    if (!playingTeamIds.includes(game.awayTeamId)) 
                        playingTeamIds.push(game.awayTeamId);
                    }
            });

            this.calculateAverageRankingPoints(eventStartDate, false, playingTeamIds);
            gameGroup.forEach(game => {
                if (daysDiff(game.date, calcDate) >= 0 && !game.excluded)
                    this.calculateGameRankingPoints(game)
                }); 
            this.calculateAverageRankingPoints(eventEndDate, false, playingTeamIds);

            if (config.calc_every_wed)
            {
                let searchDate = new Date(new Date(eventStartDate).toDateString());
                searchDate.setDate(searchDate.getDate() + 1);
                let endDate = null;
                let nextEvent = groupedGames[i+1];
                endDate = nextEvent ? new Date(nextEvent[0].date) : null;
                if (!endDate || endDate > new Date(calcDate))
                    endDate = new Date(calcDate);

                while (searchDate < endDate) {
                    if (searchDate.getDay() == 3)
                        this.calculateAverageRankingPoints(searchDate, false, null);
                    searchDate.setDate(searchDate.getDate() + 1);
                }
            }
        }
    }

    rankTeams() {
        let eligibleForRankingTeams = [];
        let unrankedTeams = [];
        Object.values(this.mrdaTeams).forEach(team => {
            if (team.activeStatusGameCount >= 3) {
                eligibleForRankingTeams.push(team);
            } else {
                unrankedTeams.push(team);
            }
        });

        let sortedTeams = eligibleForRankingTeams.sort((a, b) => b.averageRankingPoints - a.averageRankingPoints );

        for (let i = 0; i < sortedTeams.length; i++) {
            let team = sortedTeams[i];
            team.ranking = i + 1;
            team.rankingSort = i + 1;

            if (team.ranking < 6)
                team.chart = true;

            if (team.activeStatusGameCount >= 5 || team.distanceClauseApplies)
                team.postseasonEligible = true;
        }

        let sortedUnrankedTeams = unrankedTeams.sort((a, b) => b.averageRankingPoints - a.averageRankingPoints );

        for (let i = 0; i < sortedUnrankedTeams.length; i++) {
            let team = sortedUnrankedTeams[i];
            team.rankingSort = sortedTeams.length + i + 1;
        }
    }
}
