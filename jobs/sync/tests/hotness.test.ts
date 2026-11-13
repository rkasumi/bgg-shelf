import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { parseHotnessXml, runHotnessSync } from "../src/bggShelf/hotness.js";
import { runAll } from "../src/bggShelf/syncAll.js";

const xml = `<?xml version="1.0"?><items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
<item id="2" rank="2"><name value="Beta" /></item>
<item id="1" rank="1"><name value="Alpha &amp; Friends" /><yearpublished value="2026" /><thumbnail value="https://example.test/private.jpg" /></item>
</items>`;

test("hotness is ordered by rank and XML entities are decoded", () => {
  expect(parseHotnessXml(xml)).toEqual([
    { id: 1, rank: 1, name: "Alpha & Friends", yearPublished: 2026 },
    { id: 2, rank: 2, name: "Beta", yearPublished: null },
  ]);
});

test.each([
  "<html>blocked</html>", "<items></items>", "<errors><error /></errors>",
  xml.replace("</items>", ""), xml.replace('id="2"', 'id="1"'),
  xml.replace('rank="2"', 'rank="1"'), xml.replace('rank="2"', 'rank="3"'),
  xml.replace('id="2"', 'id="2.5"'), xml.replace('value="Beta"', 'value=""'),
  xml.replace('value="2026"', 'value="unknown"'), xml.replace("</items>", '<item id="3"></items>'),
])("invalid or incomplete hotness cannot become a snapshot: %s", (body) => {
  expect(() => parseHotnessXml(body)).toThrow();
});

test("sync publishes safe static formats with one authenticated request and no private metadata", async () => {
  const publicDir = await mkdtemp(join(tmpdir(), "bgg-hotness-"));
  const fetcher = vi.fn(async () => new Response(xml.replace('value="Beta"', 'value="&lt;script&gt; [click](https://evil.test) | &#10;"')));
  const result = await runHotnessSync({ token: "test-credential", publicDir, fetcher });
  expect(result).toMatchObject({ usedCache: false, count: 2 });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/\/hot\?type=boardgame$/), expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer test-credential" }),
  }));
  const json = await readFile(join(publicDir, "hotness.json"), "utf8");
  const html = await readFile(join(publicDir, "index.html"), "utf8");
  const md = await readFile(join(publicDir, "hotness.md"), "utf8");
  expect(JSON.parse(json)).toMatchObject({ schemaVersion: 1, games: [{ id: 1, rank: 1 }, { id: 2, rank: 2 }] });
  expect(html).toContain(JSON.parse(json).generatedAt);
  expect(md).toContain(JSON.parse(json).generatedAt);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(md).not.toContain("[click](https://evil.test)");
  for (const body of [json, html, md]) {
    expect(body).not.toContain("test-credential");
    expect(body).not.toContain("private.jpg");
    expect(body).not.toContain('"owned"');
  }
});

test("upstream HTTP, pending and parse failures preserve all formats and timestamps", async () => {
  const publicDir = await mkdtemp(join(tmpdir(), "bgg-hotness-cache-"));
  await runHotnessSync({ publicDir, fetcher: async () => new Response(xml) });
  const names = ["index.html", "hotness.json", "hotness.md"];
  const before = await Promise.all(names.map((name) => readFile(join(publicDir, name), "utf8")));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const response of [new Response("busy", { status: 503 }), new Response("", { status: 202 }), new Response("<items></items>")]) {
      expect((await runHotnessSync({ publicDir, fetcher: async () => response })).usedCache).toBe(true);
      expect(await Promise.all(names.map((name) => readFile(join(publicDir, name), "utf8")))).toEqual(before);
    }
  } finally { log.mockRestore(); }
});

test("first fetch failure and disk publication failure are reported as failures", async () => {
  const publicDir = await mkdtemp(join(tmpdir(), "bgg-hotness-fail-"));
  await expect(runHotnessSync({ publicDir, fetcher: async () => new Response("", { status: 403 }) })).rejects.toThrow("403");
  const blockedPath = join(publicDir, "blocked");
  await writeFile(blockedPath, "keep");
  await expect(runHotnessSync({ publicDir: blockedPath, fetcher: async () => new Response(xml) })).rejects.toThrow();
  expect(await readFile(blockedPath, "utf8")).toBe("keep");
});

test("both datasets are attempted in sequence even if either sync fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const info = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    for (const failed of ["collection", "hotness"]) {
      const calls: string[] = [];
      await expect(runAll({
        collection: async () => { calls.push("collection"); if (failed === "collection") throw new Error("offline"); return { ok: true, outputPath: "unused", count: 0, usedCache: false }; },
        hotness: async () => { calls.push("hotness"); if (failed === "hotness") throw new Error("offline"); return { publicDir: "unused", count: 0, usedCache: false }; },
        delay: async () => { calls.push("delay"); },
      })).rejects.toThrow("syncs failed");
      expect(calls).toEqual(["collection", "delay", "hotness"]);
    }
  } finally { log.mockRestore(); info.mockRestore(); }
});
