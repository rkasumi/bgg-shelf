# AGENTS.md

## Repository

- BoardGameGeek collectionを表示する静的Web appと、`collection.json`を生成するsync jobのpnpm workspace。
- `apps/web`はReact/Vite、`jobs/sync`はNode 24+のTypeScript、共有schemaは`schemas/bgg-collection.schema.json`、sampleは`fixtures/collection.sample.json`。
- schema変更時はsync出力、Web reader、fixture、sample validationを同じ差分で揃える。

## Data and Secrets

- 実collection JSON、BGG username/token、`.env`、production pathをcommitしない。
- syncには`BGG_USERNAME`が必須。任意設定は`BGG_TOKEN`、`BGG_OUTPUT_PATH`、`BGG_REQUEST_DELAY_MS`、`BGG_COLLECTION_RETRIES`。
- DNS、reverse proxy、access control、backup、production deployはprivate ops repoを正本とする。

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm validate:sample
pnpm check:secrets
```

Webの開発serverは`pnpm --filter @bgg-shelf/web dev`、sync jobは`pnpm --filter @bgg-shelf/sync sync:bgg-shelf`を既存環境変数付きで使う。
