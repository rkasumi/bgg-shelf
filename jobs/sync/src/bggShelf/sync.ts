#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BggCollection, BggGame } from "./types.js";
import { assertBggCollection } from "./validate.js";

type Attrs = Record<string, string>;
type XmlElement = {
  attrs: Attrs;
  inner: string;
};
type Fetcher = typeof fetch;
type Delay = (ms: number) => Promise<void>;

const API_BASE = process.env.BGG_API_BASE ?? "https://boardgamegeek.com/xmlapi2";
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const DEFAULT_OUTPUT = process.env.BGG_OUTPUT_PATH ?? join(DATA_DIR, "collection.json");
const REQUEST_DELAY_MS = Number(process.env.BGG_REQUEST_DELAY_MS ?? 5000);
const COLLECTION_RETRIES = Number(process.env.BGG_COLLECTION_RETRIES ?? 8);
const THING_CHUNK_SIZE = 20;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function decodeXml(value = "") {
  return value
    .replaceAll(/&#(\d+);/g, (_, codepoint: string) => String.fromCodePoint(Number(codepoint)))
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function parseAttrs(attrs = "") {
  const result: Attrs = {};
  const attrPattern = /([\w:-]+)="([^"]*)"/g;
  for (const match of attrs.matchAll(attrPattern)) {
    result[match[1]] = decodeXml(match[2]);
  }
  return result;
}

function parseElements(xml: string, tagName: string): XmlElement[] {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "g");
  return [...xml.matchAll(pattern)].map((match) => ({
    attrs: parseAttrs(match[1]),
    inner: match[2],
  }));
}

function openingAttrs(xml: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*?)(?:\\/?>)`, "g");
  return [...xml.matchAll(pattern)].map((match) => parseAttrs(match[1]));
}

function firstOpeningAttrs(xml: string, tagName: string) {
  return openingAttrs(xml, tagName)[0] ?? {};
}

function firstText(xml: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(pattern);
  return match ? decodeXml(match[1].trim()) : "";
}

function numberOrNull(value: string | undefined | null) {
  if (value === undefined || value === null || value === "" || value === "N/A" || value === "Not Ranked") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function intOrNull(value: string | undefined | null) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function parseBoardGameRank(xml: string) {
  const ranks = openingAttrs(xml, "rank");
  const boardGameRank = ranks.find((rank) => rank.name === "boardgame" || rank.type === "subtype") ?? ranks[0];
  return intOrNull(boardGameRank?.value);
}

function parseSuggestedPlayerPoll(xml: string) {
  const poll = parseElements(xml, "poll").find((entry) => entry.attrs.name === "suggested_numplayers");
  if (!poll) {
    return { recommendedPlayerCounts: [], bestPlayerCounts: [] };
  }

  const recommendedPlayerCounts: number[] = [];
  const bestPlayerCounts: number[] = [];

  for (const entry of parseElements(poll.inner, "results")) {
    const players = intOrNull(entry.attrs.numplayers);
    if (players === null) {
      continue;
    }

    const votes = Object.fromEntries(
      openingAttrs(entry.inner, "result").map((result) => [result.value, Number(result.numvotes ?? 0)]),
    );
    const best = votes.Best ?? 0;
    const recommended = votes.Recommended ?? 0;
    const notRecommended = votes["Not Recommended"] ?? 0;

    if (best + recommended > notRecommended) {
      recommendedPlayerCounts.push(players);
    }
    if (best > 0 && best >= recommended && best >= notRecommended) {
      bestPlayerCounts.push(players);
    }
  }

  return { recommendedPlayerCounts, bestPlayerCounts };
}

function parseThingXml(xml: string) {
  const details = new Map<number, BggGame>();

  for (const item of parseElements(xml, "item")) {
    const id = intOrNull(item.attrs.id);
    if (id === null) {
      continue;
    }

    const names = openingAttrs(item.inner, "name");
    const primaryName = names.find((name) => name.type === "primary") ?? names[0];
    const links = openingAttrs(item.inner, "link");
    const ratings = parseElements(item.inner, "ratings")[0]?.inner ?? item.inner;
    const suggestedPlayers = parseSuggestedPlayerPoll(item.inner);

    details.set(id, {
      id,
      name: primaryName?.value ?? "",
      addedAt: null,
      yearPublished: intOrNull(firstOpeningAttrs(item.inner, "yearpublished").value),
      image: firstText(item.inner, "image"),
      thumbnail: firstText(item.inner, "thumbnail"),
      minPlayers: intOrNull(firstOpeningAttrs(item.inner, "minplayers").value),
      maxPlayers: intOrNull(firstOpeningAttrs(item.inner, "maxplayers").value),
      recommendedPlayerCounts: suggestedPlayers.recommendedPlayerCounts,
      bestPlayerCounts: suggestedPlayers.bestPlayerCounts,
      playingTime: intOrNull(firstOpeningAttrs(item.inner, "playingtime").value),
      minPlayTime: intOrNull(firstOpeningAttrs(item.inner, "minplaytime").value),
      maxPlayTime: intOrNull(firstOpeningAttrs(item.inner, "maxplaytime").value),
      weight: numberOrNull(firstOpeningAttrs(ratings, "averageweight").value),
      averageRating: numberOrNull(firstOpeningAttrs(ratings, "average").value),
      bayesAverage: numberOrNull(firstOpeningAttrs(ratings, "bayesaverage").value),
      rank: parseBoardGameRank(ratings),
      userRating: null,
      owned: true,
      isExpansion: item.attrs.type === "boardgameexpansion",
      categories: links.filter((link) => link.type === "boardgamecategory").map((link) => link.value).filter(Boolean),
      mechanics: links.filter((link) => link.type === "boardgamemechanic").map((link) => link.value).filter(Boolean),
    });
  }

  return details;
}

function parseCollectionXml(xml: string): BggGame[] {
  return parseElements(xml, "item")
    .map((item) => {
      const stats = firstOpeningAttrs(item.inner, "stats");
      const rating = firstOpeningAttrs(item.inner, "rating");
      const status = firstOpeningAttrs(item.inner, "status");
      const ratingBlock = parseElements(item.inner, "rating")[0]?.inner ?? "";

      return {
        id: intOrNull(item.attrs.objectid) ?? 0,
        name: firstText(item.inner, "name"),
        addedAt: status.lastmodified ?? null,
        yearPublished: intOrNull(firstText(item.inner, "yearpublished")),
        image: firstText(item.inner, "image"),
        thumbnail: firstText(item.inner, "thumbnail"),
        minPlayers: intOrNull(stats.minplayers),
        maxPlayers: intOrNull(stats.maxplayers),
        recommendedPlayerCounts: [],
        bestPlayerCounts: [],
        playingTime: intOrNull(stats.playingtime),
        minPlayTime: intOrNull(stats.minplaytime),
        maxPlayTime: intOrNull(stats.maxplaytime),
        weight: null,
        averageRating: numberOrNull(firstOpeningAttrs(ratingBlock, "average").value),
        bayesAverage: numberOrNull(firstOpeningAttrs(ratingBlock, "bayesaverage").value),
        rank: parseBoardGameRank(ratingBlock),
        userRating: numberOrNull(rating.value),
        owned: status.own === "1",
        isExpansion: item.attrs.subtype === "boardgameexpansion",
        categories: [],
        mechanics: [],
      } satisfies BggGame;
    })
    .filter((game) => game.id > 0 && game.owned);
}

function mergeCollectionWithThings(collectionGames: BggGame[], thingDetails: Map<number, BggGame>) {
  return collectionGames
    .map((game) => {
      const detail = thingDetails.get(game.id);
      if (!detail) {
        return game;
      }

      return {
        ...game,
        ...detail,
        name: detail.name || game.name,
        image: detail.image || game.image,
        thumbnail: detail.thumbnail || game.thumbnail,
        userRating: game.userRating,
        addedAt: game.addedAt,
        owned: game.owned,
        isExpansion: game.isExpansion || detail.isExpansion,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchXml(url: string, token: string | undefined, fetcher: Fetcher) {
  const headers: Record<string, string> = {
    "User-Agent": "personal-data-jobs-bgg-shelf/1.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetcher(url, { headers });

  if (response.status === 202) {
    return { pending: true, xml: "" };
  }

  if (!response.ok) {
    throw new Error(`BGG request failed: ${response.status} ${response.statusText}`);
  }

  return { pending: false, xml: await response.text() };
}

async function fetchCollectionXml({
  username,
  token,
  fetcher,
  delay,
  retries,
  requestDelayMs,
}: {
  username: string;
  token?: string;
  fetcher: Fetcher;
  delay: Delay;
  retries: number;
  requestDelayMs: number;
}) {
  const params = new URLSearchParams({
    username,
    own: "1",
    stats: "1",
  });
  const url = `${API_BASE}/collection?${params.toString()}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await fetchXml(url, token, fetcher);
    if (!result.pending) {
      return result.xml;
    }
    if (attempt === retries) {
      break;
    }
    await delay(requestDelayMs);
  }

  throw new Error("BGG collection export stayed pending");
}

async function fetchThingDetails({
  ids,
  token,
  fetcher,
  delay,
  requestDelayMs,
}: {
  ids: number[];
  token?: string;
  fetcher: Fetcher;
  delay: Delay;
  requestDelayMs: number;
}) {
  const details = new Map<number, BggGame>();
  for (const idChunk of chunk(ids, THING_CHUNK_SIZE)) {
    await delay(requestDelayMs);
    const params = new URLSearchParams({
      id: idChunk.join(","),
      stats: "1",
    });
    const result = await fetchXml(`${API_BASE}/thing?${params.toString()}`, token, fetcher);
    for (const [id, detail] of parseThingXml(result.xml)) {
      details.set(id, detail);
    }
  }
  return details;
}

async function writeJson(outputPath: string, data: BggCollection) {
  assertBggCollection(data);
  await mkdir(dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempPath, outputPath);
}

export async function buildCollection({
  username,
  token,
  fetcher = fetch,
  delay = sleep,
  requestDelayMs = REQUEST_DELAY_MS,
  retries = COLLECTION_RETRIES,
}: {
  username: string;
  token?: string;
  fetcher?: Fetcher;
  delay?: Delay;
  requestDelayMs?: number;
  retries?: number;
}) {
  const collectionXml = await fetchCollectionXml({ username, token, fetcher, delay, requestDelayMs, retries });
  const collectionGames = parseCollectionXml(collectionXml);
  const details = await fetchThingDetails({
    ids: collectionGames.map((game) => game.id),
    token,
    fetcher,
    delay,
    requestDelayMs,
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceUsername: username,
    games: mergeCollectionWithThings(collectionGames, details),
  } satisfies BggCollection;
}

export async function runSync({
  username = process.env.BGG_USERNAME,
  token = process.env.BGG_TOKEN,
  outputPath,
  fetcher = fetch,
  delay = sleep,
}: {
  username?: string;
  token?: string;
  outputPath?: string;
  fetcher?: Fetcher;
  delay?: Delay;
} = {}) {
  if (!username) {
    throw new Error("BGG_USERNAME is required");
  }

  const resolvedOutputPath = outputPath ?? DEFAULT_OUTPUT;

  try {
    const collection = await buildCollection({ username, token, fetcher, delay });
    await writeJson(resolvedOutputPath, collection);
    return { ok: true, outputPath: resolvedOutputPath, count: collection.games.length, usedCache: false };
  } catch (error) {
    try {
      await readFile(resolvedOutputPath, "utf8");
      console.error(`BGG sync failed; keeping previous cache at ${resolvedOutputPath}`);
      console.error(error instanceof Error ? error.message : String(error));
      return { ok: true, outputPath: resolvedOutputPath, count: null, usedCache: true };
    } catch {
      throw error;
    }
  }
}

export const internals = {
  chunk,
  mergeCollectionWithThings,
  parseCollectionXml,
  parseSuggestedPlayerPoll,
  parseThingXml,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSync()
    .then((result) => {
      console.log(
        result.usedCache
          ? `BGG shelf cache kept: ${result.outputPath}`
          : `BGG shelf synced ${result.count} games: ${result.outputPath}`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
