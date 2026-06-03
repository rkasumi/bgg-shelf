export type BggGame = {
  id: number;
  name: string;
  addedAt: string | null;
  yearPublished: number | null;
  image: string;
  thumbnail: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  recommendedPlayerCounts: number[];
  bestPlayerCounts: number[];
  playingTime: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  weight: number | null;
  averageRating: number | null;
  bayesAverage: number | null;
  rank: number | null;
  userRating: number | null;
  owned: boolean;
  isExpansion: boolean;
  categories: string[];
  mechanics: string[];
};

export type BggCollection = {
  generatedAt: string;
  sourceUsername: string;
  games: BggGame[];
};

export type ShelfFilters = {
  query: string;
  players: number | null;
  playerFilterMode: "supported" | "recommended" | "best";
  timeRange: string | null;
  weightRange: string | null;
  sort: "rank" | "name" | "addedAt";
  excludeExpansions: boolean;
};

export type ScoredGame = BggGame & {
  bggScore: number | null;
};
