import { describe, expect, it } from "vitest";
import { recommendGames, scoreGame } from "./recommend";
import type { BggGame, ShelfFilters } from "./types";

const baseGame: BggGame = {
  id: 1,
  name: "Base Game",
  addedAt: "2026-05-01T00:00:00+00:00",
  yearPublished: 2020,
  image: "",
  thumbnail: "",
  minPlayers: 1,
  maxPlayers: 4,
  recommendedPlayerCounts: [1, 2],
  bestPlayerCounts: [2],
  playingTime: 60,
  minPlayTime: 45,
  maxPlayTime: 60,
  weight: 2.1,
  averageRating: 7.4,
  bayesAverage: 7.0,
  rank: 100,
  userRating: null,
  owned: true,
  isExpansion: false,
  categories: ["Card Game"],
  mechanics: ["Deck Building"],
};

const filters: ShelfFilters = {
  query: "",
  players: 2,
  playerFilterMode: "supported",
  timeRange: "31-60",
  weightRange: "2",
  sort: "rank",
  excludeExpansions: true,
};

describe("BGG shelf recommendation", () => {
  it("人数範囲外のゲームを除外する", () => {
    const game = { ...baseGame, minPlayers: 3, maxPlayers: 5 };
    expect(scoreGame(game, filters)).toBeNull();
  });

  it("人数の絞り込み基準を対応・Recommended・Bestで切り替えられる", () => {
    const game = { ...baseGame, minPlayers: 1, maxPlayers: 4, recommendedPlayerCounts: [1], bestPlayerCounts: [2] };
    expect(scoreGame(game, { ...filters, players: 3, playerFilterMode: "supported" })).not.toBeNull();
    expect(scoreGame(game, { ...filters, players: 3, playerFilterMode: "recommended" })).toBeNull();
    expect(scoreGame(game, { ...filters, players: 1, playerFilterMode: "recommended" })).not.toBeNull();
    expect(scoreGame(game, { ...filters, players: 1, playerFilterMode: "best" })).toBeNull();
    expect(scoreGame(game, { ...filters, players: 2, playerFilterMode: "best" })).not.toBeNull();
  });

  it("BGG scoreを表示用に保持する", () => {
    const scored = scoreGame(baseGame, filters);
    expect(scored?.bggScore).toBe(7.4);
  });

  it("検索語は名前・カテゴリ・メカニクスを対象にする", () => {
    expect(recommendGames([baseGame], { ...filters, query: "deck" })).toHaveLength(1);
    expect(recommendGames([baseGame], { ...filters, query: "worker" })).toHaveLength(0);
  });

  it("時間枠は重複しない", () => {
    expect(recommendGames([{ ...baseGame, playingTime: 30 }], { ...filters, timeRange: "0-30" })).toHaveLength(1);
    expect(recommendGames([{ ...baseGame, playingTime: 30 }], { ...filters, timeRange: "31-60" })).toHaveLength(0);
  });

  it("重さはBGGの5段階カテゴリで絞り込む", () => {
    expect(recommendGames([{ ...baseGame, weight: 2.49 }], { ...filters, weightRange: "2" })).toHaveLength(1);
    expect(recommendGames([{ ...baseGame, weight: 2.5 }], { ...filters, weightRange: "2" })).toHaveLength(0);
    expect(recommendGames([{ ...baseGame, weight: 2.5 }], { ...filters, weightRange: "3" })).toHaveLength(1);
  });

  it("ソートを切り替えられる", () => {
    const games = [
      { ...baseGame, id: 1, name: "Bravo", rank: 20, addedAt: "2026-05-03T00:00:00+00:00" },
      { ...baseGame, id: 2, name: "Alpha", rank: 30, addedAt: "2026-05-01T00:00:00+00:00" },
      { ...baseGame, id: 3, name: "Charlie", rank: 10, addedAt: "2026-05-02T00:00:00+00:00" },
    ];
    expect(recommendGames(games, { ...filters, sort: "rank" }).map((game) => game.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(recommendGames(games, { ...filters, sort: "name" }).map((game) => game.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(recommendGames(games, { ...filters, sort: "addedAt" }).map((game) => game.name)).toEqual(["Bravo", "Charlie", "Alpha"]);
  });
});
