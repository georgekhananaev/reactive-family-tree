# Reactive Family Tree: the app, in one container. No separate database, queue or cache.
#
#   docker build -f docker/Dockerfile -t reactive-family-tree .
#   docker run -v tree-data:/data -p 3000:3000 -e PUBLIC_URL=https://family.example.com reactive-family-tree
#
# The first start prints a one-time setup link to the log. The database file,
# the secret that signs sessions and the nightly snapshots all live in /data.

FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
# The packages are fetched from the lockfile alone, so a change to the source does not fetch them all again
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @reactive-family-tree/web build

FROM node:24-slim AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=file:/data/family.db
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# Which commit this image was built from and when, for the small window about the software. Both are
# optional: --build-arg REVISION=$(git rev-parse HEAD) --build-arg BUILT=$(date -u +%FT%TZ)
ARG REVISION=""
ARG BUILT=""
ENV BUILD_REVISION=$REVISION BUILD_DATE=$BUILT
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
