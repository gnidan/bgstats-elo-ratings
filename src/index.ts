import fs from "fs/promises";
import { MultiElo } from "multi-elo";

interface BgStats {
  groups: unknown;
  userInfo: unknown;
  players: {
    name: string
  }[];
  locations: unknown;
  games: {
    name: string;
  }[];
  plays: {
    playerScores: {
      playerRefId: number;
      rank: number;
    }[];
    usesTeams: boolean;
    gameRefId: number;
  }[];
  tags: unknown;
  challenges: unknown;
}

export interface Options {
  exportPath?: string;
}

export async function ratePlayers({
  exportPath = "./bgstats.json"
}: Options = {}) {
  const stats: BgStats = JSON.parse(
    (await fs.readFile(exportPath)).toString()
  );

  const results: {
    byGameRefId: {
      [gameRefId: number]: {
        byPlayerRefId: {
          [playerRefId: number]: {
            rating: number;
          }
        }
      }
    }
  } = {
    byGameRefId: {}
  };

  const plays = stats.plays
    .filter(({ usesTeams, playerScores }) => !usesTeams && playerScores.length > 1)
    .reverse();

  for (const { gameRefId, playerScores } of plays) {
    if (!results.byGameRefId[gameRefId]) {
      results.byGameRefId[gameRefId] = {
        byPlayerRefId: {}
      }
    }

    const gameResults = results.byGameRefId[gameRefId];

    const playerRefIdsRanked = playerScores
      .sort((a, b) => a.rank - b.rank)
      .map(({ playerRefId }) => playerRefId);

    for (const playerRefId of playerRefIdsRanked) {
      if (!gameResults.byPlayerRefId[playerRefId]) {
        gameResults.byPlayerRefId[playerRefId] = {
          rating: 1000
        };
      }
    }

    const currentRatings = playerRefIdsRanked
      .map(playerRefId => gameResults.byPlayerRefId[playerRefId].rating);

    console.debug("currentRatings %o", currentRatings);
    let newRatings;
    try {
      newRatings = MultiElo.getNewRatings(currentRatings);
    } catch {
      console.debug("error");
      continue;
    }

    for (const [index, playerRefId] of playerRefIdsRanked.entries()) {
      gameResults.byPlayerRefId[playerRefId].rating = newRatings[index];
    }
  }

  const humanReadableResults: {
    byGameName: {
      [gameName: string]: {
        byPlayerName: {
          [playerName: string]: {
            rating: number;
          }
        }
      }
    }
  } = {
    byGameName: Object.entries(results.byGameRefId)
      .map(([gameRefId, gameResults]) => ({
        [stats.games[parseInt(gameRefId) - 1].name]: {
          byPlayerName: Object.entries(gameResults.byPlayerRefId)
            .map(([playerRefId, gamePlayerResults]) => ({
              [stats.players[parseInt(playerRefId) - 1].name]: gamePlayerResults
            }))
            .reduce((a, b) => ({ ...a, ...b }), {})
        }
      }))
      .reduce((a, b) => ({ ...a, ...b }), {})
  };

  return humanReadableResults;
}
