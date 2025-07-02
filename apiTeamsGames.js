class ApiTeam {
    constructor(teamId, leagueName, charterType, distanceClauseApplies, initialRanking) {
        this.teamId = teamId;
        this.teamName = leagueName + ' ' + (charterType == 'primary' ? '(A)' : '(B)');
        this.distanceClauseApplies = distanceClauseApplies;
        this.initialRanking = initialRanking;
    }

    static getTeamId(leagueId, charterType) {
        if (!leagueId || !charterType)
            return;
        return leagueId + (charterType == 'primary' ? 'a' : 'b');
    }
}
const apiTeams = { "17404a": new ApiTeam("17404a","D.H.R. Men's Roller Derby", "primary", false, 200) };

class ApiGame {
    constructor(date, homeTeamId, awayTeamId, homeTeamScore, awayTeamScore, forfeit, eventName, validated = true) {
        this.date = date;
        this.homeTeamId = homeTeamId;
        this.awayTeamId = awayTeamId;
        this.homeTeamScore = homeTeamScore;
        this.awayTeamScore = awayTeamScore;
        this.forfeit = forfeit;
        this.eventName = eventName;
        this.championship = eventName && eventName.includes('Mens Roller Derby Association Championships');
        this.qualifier = eventName && eventName.includes('Qualifier');
        this.validated = validated;
    }
}
const groupedApiGames = new Map();

async function fetchGames(startDate, endDate, status, apiUrl) {
    try {
        if (!apiUrl)
            apiUrl = 'https://api.mrda.org/v1-public/sanctioning/algorithm';

        if (!startDate)
            startDate = new Date("01/01/2023");
        else
            startDate = new Date (startDate);
        apiUrl += `?start-date=${startDate.getMonth() + 1}/${startDate.getDate()}/${startDate.getFullYear()}`;

        if (!endDate) 
            endDate = new Date();
        else
            endDate = new Date(endDate);
        apiUrl += `&end-date=${endDate.getMonth() + 1}/${endDate.getDate()}/${endDate.getFullYear()}`;
        
        if (status)
            apiUrl += `&status=${status}`;

        let response = await fetch(apiUrl);

        if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);

        let data = await response.json();

        if (data.success != true || !data.payload || !Array.isArray(data.payload)) 
            throw new Error('Invalid data format received');

        return data.payload;
    } catch (error) {
        console.error('Error fetching games data:', error);
    }
}

async function buildTeamsAndGames() {
    
    //get all validated games from API
    let validatedGames = await fetchGames();

    //get yet-to-be validated games from API
    let unvalidatedGames = await fetchGames(null, null, 4);

    //get status3? yet-to-be validated games from API
    let unvalidated3Games = await fetchGames(null, null, 3);

    //combine the unvalidated and validated games and sort by date
    let apiGames = [...(validatedGames || []), ...(unvalidated3Games || []), ...(unvalidatedGames || [])].sort((a, b) => 
        new Date(a.event.game_datetime) - new Date(b.event.game_datetime));

    //build apiTeams from API response
    apiGames.forEach(game => {
        let homeTeamId = ApiTeam.getTeamId(game.event.home_league, game.event.home_league_charter);
        if (homeTeamId && !apiTeams[homeTeamId]) {
            apiTeams[homeTeamId] = new ApiTeam(
                homeTeamId,
                game.event.home_league_name,
                game.event.home_league_charter, 
                teamInfo[homeTeamId].distance_clause_applies, 
                teamInfo[homeTeamId].initial_ranking);
        }
        let awayTeamId = ApiTeam.getTeamId(game.event.away_league, game.event.away_league_charter);
        if (awayTeamId && !apiTeams[awayTeamId]) {
            apiTeams[awayTeamId] = new ApiTeam(
                awayTeamId,
                game.event.away_league_name, 
                game.event.away_league_charter, 
                teamInfo[awayTeamId].distance_clause_applies, 
                teamInfo[awayTeamId].initial_ranking);
        }
    });

    //group pre-2024 game history by sanctioning_id and add to groupedApiGames
    gameHistory.forEach(game => {
        let homeTeamId = null;
        let awayTeamId = null;
        let teamIds = Object.keys(teamInfo);
        for (let i = 0; i < teamIds.length; i++) {
            const teamId = teamIds[i];
            if (!homeTeamId && teamInfo[teamId].team_abbreviation == game.home_team_abbrev) {
                homeTeamId = teamId;
            }
            if (!awayTeamId && teamInfo[teamId].team_abbreviation == game.away_team_abbrev) {
                awayTeamId = teamId;
            }
            if (homeTeamId && awayTeamId) {
                if (!groupedApiGames.has(game.sanctioning_id)) {
                    groupedApiGames.set(game.sanctioning_id, []);
                }
                let apiGame = new ApiGame(
                    game.game_date + " 12:00:00", 
                    homeTeamId,
                    awayTeamId,
                    game.home_team_score,
                    game.away_team_score,
                    (game.home_team_score == 100 && game.away_team_score == 0) 
                        || (game.away_team_score == 100 && game.home_team_score == 0));
                        
                groupedApiGames.get(game.sanctioning_id).push(apiGame);
                break;
            }
        }
    });

    //add API games to groupedApiGames
    apiGames.forEach(game => {
        //required fields
        if (!game.event || !game.event.game_datetime 
            || !game.event.home_league || !game.event.home_league_charter
            || !game.event.away_league || !game.event.away_league_charter
            || game.event.home_league_score == null || game.event.away_league_score == null)
            return;

        if (!groupedApiGames.has(game.event.sanctioning_id)) {
            groupedApiGames.set(game.event.sanctioning_id, []);
        }

        let apiGame = new ApiGame(
            game.event.game_datetime,
            ApiTeam.getTeamId(game.event.home_league, game.event.home_league_charter),
            ApiTeam.getTeamId(game.event.away_league, game.event.away_league_charter),
            game.event.forfeit != 1 ? game.event.home_league_score : (game.event.forfeit_league == game.event.home_league ? 0 : 100),
            game.event.forfeit != 1 ? game.event.away_league_score : (game.event.forfeit_league == game.event.away_league ? 0 : 100),
            game.event.forfeit == 1,
            game.sanctioning ? game.sanctioning.event_name : null,
            game.event.status == "7");

        groupedApiGames.get(game.event.sanctioning_id).push(apiGame);
    });
}