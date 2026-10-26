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
`ai/collection.json` alongside the internal collection file. Serve them at
`/ai/`, `/ai/collection.md`, and `/ai/collection.json`. They require no JavaScript,
images, database, API server, MCP server, or additional BGG requests from readers.
The formats contain separate current/former lists, BGG IDs, player counts,
duration, complexity, personal rating, categories, and mechanics. The JSON has
`schemaVersion: 1`, `generatedAt`, counts, explanatory notes, and games.
The username, image URLs, and raw status timestamps are omitted.

Previous ownership is not a negative preference: sale reasons are unknown.
Both ownership flags can be true (for example, multiple copies); currently
owned takes precedence in the displayed sections. Missing values remain unknown.
The legacy internal field `addedAt` is BGG's status modification timestamp,
not a purchase or disposal date.

Tell a bot to use the static export as its collection source, check
`generatedAt`, distinguish current and former ownership, and report retrieval
failures instead of guessing or fetching BGG. Store the source URL and these
rules in its preferences rather than treating a remembered list as current.

Public hosting should allow only the three exact paths with GET/HEAD, explicit
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

Do not commit real collection JSON, BGG usernames, tokens, generated cache, `.env` files, production paths, or deployment host details.

## Deployment notes

The public repo should stay portable. Production DNS, reverse proxy, access control, paths, scheduling, backup, and deploy logs belong in the private ops repo.

Recommended production shape:

- static web app: GitHub Release artifact or equivalent static build output.
- generated data: `collection.json` produced by the sync job and served as no-cache JSON under `/data/collection.json`.
- sync scheduling: ops-managed scheduled job.

GitHub repo creation, push, DNS changes, and production deploy are intentionally separate approval steps.
