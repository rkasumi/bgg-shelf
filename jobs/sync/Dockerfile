FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY jobs/sync/package.json jobs/sync/package.json
RUN pnpm install --frozen-lockfile --filter @bgg-shelf/sync

COPY jobs/sync jobs/sync
RUN pnpm --filter @bgg-shelf/sync build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

USER root
RUN mkdir -p /app /data \
    && chown -R node:node /app /data

COPY --from=build /app/jobs/sync/dist ./dist

USER node

CMD ["node", "/app/dist/bggShelf/sync.js"]
