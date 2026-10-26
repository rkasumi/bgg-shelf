import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPublicFiles } from "../src/bggShelf/public.js";
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
  <item type="boardgameexpansion" id="2"><name type="primary" value="Expansion" /></item>
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
  expect(calls.filter((url) => url.includes("/collection"))).toHaveLength(3);
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

const historyXml = `<items totalitems="4">
  <item objectid="1"><name>Former copy</name><status own="0" prevowned="1" /></item>
  <item objectid="1"><name>Current copy</name><status own="1" prevowned="0" /><stats><rating value="8" /></stats></item>
  <item objectid="3"><name>Former game</name><status own="0" prevowned="1" /><stats><rating value="7" /></stats></item>
  <item objectid="4"><name>Wishlist only</name><status own="0" prevowned="0" wishlist="1" /></item>
</items>`;

function historyFetcher(url: string | URL | Request) {
  const parsed = new URL(String(url));
  if (parsed.pathname.endsWith("/collection")) {
    return Promise.resolve(new Response(parsed.searchParams.get("subtype") === "boardgameexpansion"
      ? '<items totalitems="0"></items>' : historyXml));
  }
  return Promise.resolve(new Response('<items><item id="1" type="boardgame"><name type="primary" value="Current game" /></item><item id="3" type="boardgame"><name type="primary" value="Former game" /></item></items>'));
}

test("sync includes previous ownership, merges copies, and excludes wishlist-only games", async () => {
  const urls: URL[] = [];
  const result = await buildCollection({ username: "tester", delay: async () => {}, fetcher: (url) => {
    urls.push(new URL(String(url)));
    return historyFetcher(url);
  }});
  expect(result.games).toHaveLength(2);
  expect(result.games.find((game) => game.id === 1)).toMatchObject({ owned: true, previouslyOwned: true, userRating: 8 });
  expect(result.games.find((game) => game.id === 3)).toMatchObject({ owned: false, previouslyOwned: true, userRating: 7 });
  const queries = urls.filter((url) => url.pathname.endsWith("/collection"));
  expect(queries.map((url) => url.searchParams.get("subtype"))).toEqual(["boardgame", "boardgameexpansion"]);
  expect(queries.every((url) => !url.searchParams.has("own"))).toBe(true);
  expect(queries[0].searchParams.get("excludesubtype")).toBe("boardgameexpansion");
  expect(urls.find((url) => url.pathname.endsWith("/thing"))?.searchParams.get("id")).toBe("1,3");
});

test("public exports escape markup and expose only the allowed fields", async () => {
  const collection = await buildCollection({ username: "private-user", delay: async () => {}, fetcher: historyFetcher });
  collection.games[0].name = '<script>alert(1)</script> [click](https://evil.test) | unsafe';
  collection.games[0].image = "https://private.test/image";
  const files = renderPublicFiles(collection);
  const data = JSON.parse(files["collection.json"]);
  expect(data.counts).toEqual({ total: 2, owned: 1, previouslyOwnedOnly: 1 });
  expect(data.games[0]).not.toHaveProperty("image");
  expect(data.games[0]).not.toHaveProperty("addedAt");
  for (const value of Object.values(files)) expect(value).not.toContain("private-user");
  expect(files["index.html"]).not.toContain("<script>");
  expect(files["index.html"]).toContain("&lt;script&gt;");
  expect(files["index.html"]).not.toContain('href="https://evil.test');
  expect(files["collection.md"]).not.toContain("[click](https://evil.test)");
  expect(files["collection.md"]).toContain("嫌い・低評価とは判断できません");
});

test("successful sync writes all static exports; upstream failure preserves them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bgg-shelf-public-"));
  const outputPath = join(dir, "collection.json");
  await runSync({ username: "tester", outputPath, delay: async () => {}, fetcher: historyFetcher });
  const before = await readFile(join(dir, "ai", "collection.json"), "utf8");
  const beforeMeta = await readFile(join(dir, "ai", "meta.json"), "utf8");
  const full = JSON.parse(await readFile(outputPath, "utf8"));
  expect(JSON.parse(before).generatedAt).toBe(full.generatedAt);
  expect(JSON.parse(beforeMeta).generatedAt).toBe(full.generatedAt);
  expect(await readFile(join(dir, "ai", "index.html"), "utf8")).toContain("以前所持していたゲーム（1件）");
  expect(await readFile(join(dir, "ai", "collection.md"), "utf8")).toContain("Former game");
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await runSync({ username: "tester", outputPath, delay: async () => {}, fetcher: async () => new Response('<errors><error message="Unavailable" /></errors>') });
    expect(result.usedCache).toBe(true);
    expect(await readFile(join(dir, "ai", "collection.json"), "utf8")).toBe(before);
    expect(await readFile(join(dir, "ai", "meta.json"), "utf8")).toBe(beforeMeta);
  } finally { console.error = originalError; }
});

test("compact metadata tracks ownership independently of ordering, sync time and game details", async () => {
  const collection = await buildCollection({ username: "private-user", delay: async () => {}, fetcher: historyFetcher });
  const metadata = () => JSON.parse(renderPublicFiles(collection)["meta.json"]);
  const first = metadata();
  expect(first.ownedIds).toEqual([1]);
  expect(first.counts).toEqual({ total: 2, owned: 1, previouslyOwnedOnly: 1 });
  expect(first.collectionUrl).toBe("./collection.json");
  expect(first.ownershipHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(first).not.toHaveProperty("games");
  collection.games.reverse();
  collection.generatedAt = "2026-10-27T00:00:00Z";
  collection.games[0].name = "Renamed";
  collection.games[0].userRating = 10;
  expect(metadata().ownershipHash).toBe(first.ownershipHash);
  collection.games[0].owned = true;
  const acquired = metadata();
  expect(acquired.ownedIds).toEqual([1, 3]);
  expect(acquired.ownershipHash).not.toBe(first.ownershipHash);
  collection.games[0].previouslyOwned = false;
  expect(metadata().ownershipHash).not.toBe(acquired.ownershipHash);
  collection.games.pop();
  expect(metadata().ownedIds).toEqual([3]);
});

test("incomplete thing details fail instead of publishing an incomplete snapshot", async () => {
  await expect(buildCollection({ username: "tester", delay: async () => {}, fetcher: async (url) =>
    String(url).includes("/collection") ? historyFetcher(url) : new Response('<items></items>')
  })).rejects.toThrow("incomplete");
});

test("truncated collection XML cannot erase the previous shelf", async () => {
  await expect(buildCollection({ username: "tester", delay: async () => {}, fetcher: async () =>
    new Response('<items totalitems="2"><item objectid="1"><name>Truncated</name>')
  })).rejects.toThrow("invalid collection");
});

test("disk publication failures are not reported as successful cached syncs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bgg-shelf-disk-"));
  const outputPath = join(dir, "collection.json");
  await writeFile(outputPath, "previous snapshot");
  await writeFile(join(dir, "ai"), "not a directory");
  await expect(runSync({ username: "tester", outputPath, delay: async () => {}, fetcher: historyFetcher })).rejects.toThrow();
  expect(await readFile(outputPath, "utf8")).toBe("previous snapshot");
});
