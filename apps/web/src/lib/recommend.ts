import type { BggGame, ScoredGame, ShelfFilters } from "./types";

function includesText(game: BggGame, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [game.name, ...game.categories, ...game.mechanics].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function bggScoreOf(game: BggGame) {
  return game.averageRating ?? game.bayesAverage;
}

function supportsPlayerCount(game: BggGame, players: number) {
  if (game.minPlayers === null || game.maxPlayers === null) {
    return true;
  }
  return players >= game.minPlayers && players <= game.maxPlayers;
}

function playerCounts(values: number[] | undefined) {
  return Array.isArray(values) ? values : [];
}

function matchesPlayerFilter(game: BggGame, filters: ShelfFilters) {
  if (filters.players === null) {
    return true;
  }
  if (filters.playerFilterMode === "best") {
    return playerCounts(game.bestPlayerCounts).includes(filters.players);
  }
  if (filters.playerFilterMode === "recommended") {
    return playerCounts(game.recommendedPlayerCounts).includes(filters.players);
  }
  return supportsPlayerCount(game, filters.players);
}

function displayTime(game: BggGame) {
  return game.playingTime ?? game.maxPlayTime ?? game.minPlayTime;
}

const timeRanges: Record<string, { min: number | null; max: number | null }> = {
  "0-30": { min: null, max: 30 },
  "31-60": { min: 30, max: 60 },
  "61-90": { min: 60, max: 90 },
  "91-120": { min: 90, max: 120 },
  "121+": { min: 120, max: null },
};

function inRange(value: number | null, range: { min: number | null; max: number | null }) {
  if (value === null) {
    return false;
  }
  if (range.min !== null && value <= range.min) {
    return false;
  }
  if (range.max !== null && value > range.max) {
    return false;
  }
  return true;
}

function weightCategory(weight: number | null) {
  if (weight === null || weight <= 0) {
    return null;
  }
  return String(Math.min(5, Math.max(1, Math.round(weight))));
}

function compareNullableNumber(a: number | null, b: number | null) {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

function compareNullableDateDesc(a: string | null, b: string | null) {
  const aTime = a ? new Date(a).getTime() : Number.NaN;
  const bTime = b ? new Date(b).getTime() : Number.NaN;
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);
  if (!aValid && !bValid) {
    return 0;
  }
  if (!aValid) {
    return 1;
  }
  if (!bValid) {
    return -1;
  }
  return bTime - aTime;
}

export function scoreGame(game: BggGame, filters: ShelfFilters): ScoredGame | null {
  if (filters.excludeExpansions && game.isExpansion) {
    return null;
  }
  if (!includesText(game, filters.query)) {
    return null;
  }
  if (!matchesPlayerFilter(game, filters)) {
    return null;
  }

  const minutes = displayTime(game);
  if (filters.timeRange !== null) {
    const range = timeRanges[filters.timeRange];
    if (range && !inRange(minutes, range)) {
      return null;
    }
  }

  if (filters.weightRange !== null) {
    if (weightCategory(game.weight) !== filters.weightRange) {
      return null;
    }
  }

  const bggScore = bggScoreOf(game);

  return {
    ...game,
    bggScore,
  };
}

export function recommendGames(games: BggGame[], filters: ShelfFilters) {
  return games
    .map((game) => scoreGame(game, filters))
    .filter((game): game is ScoredGame => game !== null)
    .sort((a, b) => {
      if (filters.sort === "name") {
        return a.name.localeCompare(b.name, "ja");
      }
      if (filters.sort === "addedAt") {
        return compareNullableDateDesc(a.addedAt, b.addedAt) || a.name.localeCompare(b.name, "ja");
      }
      return compareNullableNumber(a.rank, b.rank) || a.name.localeCompare(b.name, "ja");
    });
}
