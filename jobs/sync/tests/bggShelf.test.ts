import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCollection, internals, runSync } from "../src/bggShelf/sync.js";

const collectionXml = `<?xml version="1.0"?>
<items totalitems="2">
  <item objecttype="thing" objectid="1" subtype="boardgame" collid="10">
    <name sortindex="1">Alpha&#039;s Game</name>
    <yearpublished>2020</yearpublished>
    <image>https://example.test/alpha.jpg</image>
    <thumbnail>https://example.test/alpha-thumb.jpg</thumbnail>
    <stats minplayers="1" maxplayers="4" minplaytime="30" maxplaytime="60" playingtime="60">
      <rating value="8">
        <average value="7.3" />
        <bayesaverage value="6.8" />
        <ranks><rank type="subtype" name="boardgame" value="123" /></ranks>
      </rating>
    </stats>
    <status own="1" lastmodified="2026-05-01T12:00:00+00:00" />
    <numplays>0</numplays>
  </item>
  <item objecttype="thing" objectid="2" subtype="boardgameexpansion" collid="11">
    <name sortindex="1">Expansion</name>
    <status own="1" />
    <numplays>1</numplays>
  </item>
</items>`;

const thingXml = `<?xml version="1.0"?>
<items>
  <item type="boardgame" id="1">
    <thumbnail>https://example.test/alpha-detail-thumb.jpg</thumbnail>
    <image>https://example.test/alpha-detail.jpg</image>
    <name type="primary" sortindex="1" value="Alpha&#039;s Game Deluxe" />
    <yearpublished value="2021" />
    <minplayers value="1" />
    <maxplayers value="4" />
    <playingtime value="60" />
    <minplaytime value="30" />
    <maxplaytime value="60" />
    <poll name="suggested_numplayers">
      <results numplayers="1">
        <result value="Best" numvotes="1" />
        <result value="Recommended" numvotes="3" />
        <result value="Not Recommended" numvotes="0" />
      </results>
      <results numplayers="2">
        <result value="Best" numvotes="4" />
        <result value="Recommended" numvotes="1" />
        <result value="Not Recommended" numvotes="0" />
      </results>
    </poll>
    <link type="boardgamecategory" id="100" value="Children&#039;s Game" />
    <link type="boardgamemechanic" id="200" value="Deck Building" />
    <statistics>
      <ratings>
        <average value="7.8" />
        <bayesaverage value="7.1" />
        <averageweight value="2.3" />
        <ranks><rank type="subtype" name="boardgame" value="42" /></ranks>
      </ratings>
    </statistics>
  </item>
</items>`;

test("collection XML is normalized and expansion subtype is preserved", () => {
  const games = internals.parseCollectionXml(collectionXml);
  expect(games).toHaveLength(2);
  expect(games[0].name).toBe("Alpha's Game");
  expect(games[0].addedAt).toBe("2026-05-01T12:00:00+00:00");
  expect(games[0].userRating).toBe(8);
  expect(games[1].isExpansion).toBe(true);
});

test("thing XML adds details, categories, mechanics, and best player counts", () => {
  const details = internals.parseThingXml(thingXml);
  const game = details.get(1);
  expect(game?.name).toBe("Alpha's Game Deluxe");
  expect(game?.recommendedPlayerCounts).toEqual([1, 2]);
  expect(game?.bestPlayerCounts).toEqual([2]);
  expect(game?.categories).toEqual(["Children's Game"]);
  expect(game?.mechanics).toEqual(["Deck Building"]);
  expect(game?.weight).toBe(2.3);
});

test("buildCollection retries 202 collection responses and fetches thing chunks", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string | URL | Request) => {
    const urlString = String(url);
    calls.push(urlString);
    if (urlString.includes("/collection") && calls.length === 1) {
      return new Response("", { status: 202 });
    }
    if (urlString.includes("/collection")) {
      return new Response(collectionXml, { status: 200 });
    }
    return new Response(thingXml, { status: 200 });
  };

  const result = await buildCollection({
    username: "tester",
    token: "token",
    fetcher,
    delay: async () => {},
    requestDelayMs: 0,
    retries: 2,
  });

  expect(result.sourceUsername).toBe("tester");
  expect(result.games).toHaveLength(2);
  expect(result.games[0].name).toBe("Alpha's Game Deluxe");
  expect(calls.filter((url) => url.includes("/collection"))).toHaveLength(2);
  expect(calls.filter((url) => url.includes("/thing"))).toHaveLength(1);
});

test("buildCollection only sends authorization headers when a token is configured", async () => {
  const fetchHeaders: HeadersInit[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    fetchHeaders.push(init?.headers ?? {});
    if (String(url).includes("/collection")) {
      return new Response(collectionXml, { status: 200 });
    }
    return new Response(thingXml, { status: 200 });
  };

  await buildCollection({
    username: "tester",
    fetcher,
    delay: async () => {},
    requestDelayMs: 0,
  });
  expect(fetchHeaders.every((headers) => !("Authorization" in (headers as Record<string, string>)))).toBe(true);

  fetchHeaders.length = 0;
  await buildCollection({
    username: "tester",
    token: "secret-token",
    fetcher,
    delay: async () => {},
    requestDelayMs: 0,
  });
  expect(fetchHeaders.every((headers) => (headers as Record<string, string>).Authorization === "Bearer secret-token")).toBe(
    true,
  );
});

test("chunking uses BGG's 20 thing limit", () => {
  expect(internals.chunk(Array.from({ length: 41 }, (_, index) => index + 1), 20).map((part) => part.length)).toEqual([
    20,
    20,
    1,
  ]);
});

test("runSync keeps the previous cache if BGG fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bgg-shelf-"));
  const outputPath = join(dir, "collection.json");
  await writeFile(outputPath, "{\"games\":[]}\n", "utf8");

  const originalError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await runSync({
      username: "tester",
      token: "token",
      outputPath,
      fetcher: async () => new Response("busy", { status: 503, statusText: "Busy" }),
      delay: async () => {},
    });
  } finally {
    console.error = originalError;
  }

  expect(result.usedCache).toBe(true);
  expect(await readFile(outputPath, "utf8")).toBe("{\"games\":[]}\n");
});
