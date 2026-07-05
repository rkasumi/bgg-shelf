# bgg-shelf

- 目的: BoardGameGeekコレクションを表示する静的Webアプリと、表示用`collection.json`を生成するsyncジョブのpnpm monorepo。
- スタック: Node / pnpm workspace(`apps/web`, `jobs/sync`)、React/Vite(web)、TypeScript(sync job、Node >=24)。
- 主要コマンド: install `pnpm install` / test `pnpm test`(全workspace再帰) / typecheck `pnpm typecheck` / build `pnpm build` / サンプル検証 `pnpm validate:sample` / secret検査 `pnpm check:secrets` / web dev `pnpm --filter @bgg-shelf/web dev`
- syncジョブ実行: `cd jobs/sync && BGG_USERNAME=<user> DATA_DIR=<dir> pnpm sync:bgg-shelf`(必須`BGG_USERNAME`、任意`BGG_TOKEN`/`BGG_OUTPUT_PATH`/`BGG_REQUEST_DELAY_MS`既定5000/`BGG_COLLECTION_RETRIES`既定8)
- 注意: 本番DNS・reverse proxy・access control・backup・deployはprivate ops repo管理。実コレクションJSON・トークン・`.env`はgit管理しない。
