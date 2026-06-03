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

Do not commit real collection JSON, BGG usernames, tokens, generated cache, `.env` files, production paths, or deployment host details.

## Deployment notes

The public repo should stay portable. Production DNS, reverse proxy, access control, paths, scheduling, backup, and deploy logs belong in the private ops repo.

Recommended production shape:

- static web app: GitHub Release artifact or equivalent static build output.
- generated data: `collection.json` produced by the sync job and served as no-cache JSON under `/data/collection.json`.
- sync scheduling: ops-managed scheduled job.

GitHub repo creation, push, DNS changes, and production deploy are intentionally separate approval steps.
