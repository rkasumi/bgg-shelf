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
