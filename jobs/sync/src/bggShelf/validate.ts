import type { BggCollection, BggGame } from "./types.js";

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBggGame(value: unknown): value is BggGame {
  if (!value || typeof value !== "object") {
    return false;
  }
  const game = value as Record<string, unknown>;
  return (
    typeof game.id === "number" &&
    typeof game.name === "string" &&
    isStringOrNull(game.addedAt) &&
    isNumberOrNull(game.yearPublished) &&
    typeof game.image === "string" &&
    typeof game.thumbnail === "string" &&
    isNumberOrNull(game.minPlayers) &&
    isNumberOrNull(game.maxPlayers) &&
    isNumberArray(game.recommendedPlayerCounts) &&
    isNumberArray(game.bestPlayerCounts) &&
    isNumberOrNull(game.playingTime) &&
    isNumberOrNull(game.minPlayTime) &&
    isNumberOrNull(game.maxPlayTime) &&
    isNumberOrNull(game.weight) &&
    isNumberOrNull(game.averageRating) &&
    isNumberOrNull(game.bayesAverage) &&
    isNumberOrNull(game.rank) &&
    isNumberOrNull(game.userRating) &&
    typeof game.owned === "boolean" &&
    typeof game.isExpansion === "boolean" &&
    isStringArray(game.categories) &&
    isStringArray(game.mechanics)
  );
}

export function assertBggCollection(value: unknown): asserts value is BggCollection {
  if (!value || typeof value !== "object") {
    throw new Error("BGG collection must be an object");
  }
  const collection = value as Record<string, unknown>;
  if (
    typeof collection.generatedAt !== "string" ||
    typeof collection.sourceUsername !== "string" ||
    !Array.isArray(collection.games) ||
    !collection.games.every(isBggGame)
  ) {
    throw new Error("BGG collection shape is invalid");
  }
}
