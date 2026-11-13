# bgg-shelf

Static BoardGameGeek collection browser plus a small sync job that writes the JSON file consumed by the UI.

The web app reads `data/collection.json` from the same origin. For a subdomain deployment, build the web app with Vite base `/` and serve the generated app together with `/data/collection.json`.

## Structure

- `apps/web`: React / Vite static UI.
- `jobs/sync`: Node.js BGG XML API2 sync job.
- `schemas/bgg-collection.schema.json`: public JSON contract for `collection.json`.
- `fixtures/collection.sample.json`: small public fixture used by the UI sample and validation.

## Local development

```bash
pnpm install
pnpm -s test
pnpm -s typecheck
pnpm -s build
pnpm -s validate:sample
pnpm -s check:secrets
```

Run the web app:

```bash
pnpm --filter @bgg-shelf/web dev
```

The dev server serves `apps/web/public/data/collection.json`, which is copied from the public sample fixture.

## Sync job

```bash
cd jobs/sync
BGG_USERNAME=<bgg-user> DATA_DIR=/tmp/bgg-shelf pnpm sync:bgg-shelf
```

Environment variables:

- `BGG_USERNAME`: required BoardGameGeek username.
- `BGG_TOKEN`: optional bearer token, sent only when configured.
- `DATA_DIR`: output root. The default output is `collection.json` below this path.
- `BGG_OUTPUT_PATH`: optional explicit output path.
- `BGG_REQUEST_DELAY_MS`: optional delay between BGG API requests. Default: `5000`.
- `BGG_COLLECTION_RETRIES`: optional retries for pending collection export. Default: `8`.

The job reads the boardgame and expansion collections, retaining only entries
marked owned or previously owned. Duplicate BGG IDs are combined; if any copy is
owned, the game remains in the owned list. Wishlist-only entries are discarded
before requesting game details. Mark a game as **Previously Owned** on BGG to
include it in the history; simply removing it cannot reconstruct that history.
The web recommendations include only currently owned games.

## Static exports for AI readers

Each successful sync also writes `ai/index.html`, `ai/collection.md`, and
`ai/collection.json`, plus a compact `ai/meta.json`, alongside the internal
collection file. Serve them at `/ai/`, `/ai/collection.md`, `/ai/collection.json`,
and `/ai/meta.json`. They require no JavaScript,
images, database, API server, MCP server, or additional BGG requests from readers.
The three detailed formats contain separate current/former lists, BGG IDs, player
counts, duration, complexity, personal rating, categories, and mechanics. Their JSON has
`schemaVersion: 1`, `generatedAt`, counts, explanatory notes, and games.
The username, image URLs, and raw status timestamps are omitted.

`meta.json` contains `schemaVersion`, `generatedAt`, `counts`, sorted `ownedIds`,
`ownershipHash`, and `collectionUrl` (resolved relative to the metadata URL).
The hash is SHA-256 of JSON-encoded `[id, owned, previouslyOwned]` tuples sorted
by numeric ID, including current and former entries. It changes on membership or
flag changes, not on sync time, names, ratings, or other metadata. It is not a
hash of the full collection. Use the detailed collection for interpretation notes
and metadata; an absent ID in `ownedIds` alone does not prove real-world nonownership.
No purchase/disposal dates or recent-change history are inferred.
Readers may use conditional GET (`If-None-Match` or `If-Modified-Since`) against
static-host validators; a 304 reuses the cached body. A fresh sync can change the
file validator while `ownershipHash` stays unchanged.

The shared `notes` in `jobs/sync/src/bggShelf/public.ts` define the data and
owner-provided interpretation rules for all three formats. Keep specific tastes,
usual player counts, individual evaluations, and disposal reasons in the bot's
profile, not in this public dataset. Explicit statements from the owner take
precedence over inferences from the saved BGG registrations. Ownership is a
positive clue but can include unplayed purchases; previous ownership alone is
not a negative preference. Registration lag and edition differences can leave
real-world ownership incompletely represented. Missing ratings are not low
ratings, and a zero or absent weight means unknown complexity.

Both ownership flags can be true (for example, multiple copies); currently
owned takes precedence in the displayed sections. Missing values remain unknown.
The legacy internal field `addedAt` is BGG's status modification timestamp,
not a purchase or disposal date.

Tell a bot to use the static export as its collection source, check
`generatedAt`, distinguish current and former ownership, and report retrieval
failures instead of guessing. Additional BGG requests are normally unnecessary
for ownership checks; external research about rules, reviews, releases, or edition
differences remains appropriate when needed. Store the source URL and these rules
in its preferences rather than treating a remembered list as current.

Public hosting should allow only the four collection paths above with GET/HEAD, explicit
content types, `nosniff`, and a restrictive CSP. Do not expose the output directory
or `.tmp` files. Keep other routes behind existing authentication if desired.
All external strings are escaped in HTML and Markdown; JSON uses an explicit
field allowlist. No third-party resource is fetched by the HTML page.

The job renders every format before publishing and replaces each file through
rename. Upstream errors retain the previous snapshot and its original timestamp.
Replacement is atomic per file, not across all formats: clients combining formats
must compare `generatedAt` and retry on a mismatch. A short public cache (for
example, five minutes) reduces origin load. BGG history becomes available only
after the updated job completes a successful sync. Old web readers must be
updated to exclude `owned=false` before that sync is enabled.

## Hotness exports

`sync:bgg-shelf` and the container's default command update both the collection
and BoardGameGeek Hotness, sequentially with `BGG_REQUEST_DELAY_MS` between them.
Each dataset is attempted even if the other fails. They have independent
timestamps and caches; failure without a previous snapshot fails the job.
Hotness upstream failures keep all previous formats and their original timestamp;
disk publication errors fail the job. Replacements are atomic per file, so readers
combining formats must compare `generatedAt` and retry on a mismatch.

To update only Hotness (no BGG username required), run from `jobs/sync`:

```bash
DATA_DIR=/tmp/bgg-shelf pnpm sync:hotness
```

The job requests `/xmlapi2/hot?type=boardgame` once using the existing `BGG_TOKEN`
bearer authentication and `BGG_API_BASE` override, if configured. The output is
`DATA_DIR/ai/hotness/index.html`, `hotness.md`, and `hotness.json`.
Unlike collection output, this directory is independent of `BGG_OUTPUT_PATH`.
JSON contains `schemaVersion: 1`, `generatedAt`, `source`, `notes`, and `games`.
Each game has `id`, `rank` (Hotness rank, not overall BGG rank), `name`, and
nullable `yearPublished`. Games are ordered by rank. No ownership, usernames,
tokens, thumbnail URLs, ranking history, or inferred reasons for popularity are
included. The full returned list is retained, including games outside the collection.

Grok bot / Muse should read `/ai/hotness/` (plain HTML without JavaScript),
`/ai/hotness/hotness.md`, or `/ai/hotness/hotness.json`, report `generatedAt`, and
join the collection by BGG ID when asked about ownership. Neither missing entries
nor failed retrievals establish a current rank. No direct BGG access is needed
by the reader. Actual retrieval from Grok bot / Muse must be verified after deployment.

Public hosting must explicitly allow these three Hotness paths with GET/HEAD,
correct content types, `nosniff`, and the HTML CSP. Do not expose the directory,
temporary files, or other data paths. A short cache such as five minutes is suitable;
the sync frequency is configured separately in private ops. Hotness is not linked
from the collection page, so the existing collection paths work before Hotness
hosting is enabled. Provision an official, legibly sized **Powered by BGG** logo
as `/ai/hotness/powered-by-bgg.png` (also an explicit GET/HEAD allowlist entry);
the HTML links it back to BGG and permits only same-origin images.

Before public deployment, verify the registered application's permitted use against
[BGG's API guide](https://boardgamegeek.com/using_the_xml_api) and
[XML API terms](https://boardgamegeek.com/wiki/page/XML_API_Terms_of_Use).
The guide prohibits third-party services providing BGG data to other applications;
whether the intended bot readers are permitted needs confirmation from BGG.
Public use requires the official linked logo; AI/LLM training using this data is
prohibited. Public hosting, scheduling, and production changes remain in private ops.

Do not commit real collection JSON, BGG usernames, tokens, generated cache, `.env` files, production paths, or deployment host details.

## Deployment notes

The public repo should stay portable. Production DNS, reverse proxy, access control, paths, scheduling, backup, and deploy logs belong in the private ops repo.

Recommended production shape:

- static web app: GitHub Release artifact or equivalent static build output.
- generated data: `collection.json` produced by the sync job and served as no-cache JSON under `/data/collection.json`.
- sync scheduling: ops-managed scheduled job.

GitHub repo creation, push, DNS changes, and production deploy are intentionally separate approval steps.
