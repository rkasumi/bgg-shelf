import { readFile } from "node:fs/promises";

const requiredGameKeys = [
  "id",
  "name",
  "addedAt",
  "yearPublished",
  "image",
  "thumbnail",
  "minPlayers",
  "maxPlayers",
  "recommendedPlayerCounts",
  "bestPlayerCounts",
  "playingTime",
  "minPlayTime",
  "maxPlayTime",
  "weight",
  "averageRating",
  "bayesAverage",
  "rank",
  "userRating",
  "owned",
  "isExpansion",
  "categories",
  "mechanics",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const collection = JSON.parse(await readFile("fixtures/collection.sample.json", "utf8"));

if (typeof collection.generatedAt !== "string" || typeof collection.sourceUsername !== "string" || !Array.isArray(collection.games)) {
  fail("collection.sample.json has an invalid top-level shape");
}

for (const game of collection.games) {
  for (const key of requiredGameKeys) {
    if (!(key in game)) {
      fail(`collection.sample.json game is missing ${key}`);
    }
  }
}

console.log(`sample collection ok: ${collection.games.length} games`);
