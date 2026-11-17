# The project site (the home page, the docs and the in-browser demo) as plain files behind nginx.
#
#   docker build -f docker/site.Dockerfile --build-arg SITE_URL=https://tree-project.example.com -t reactive-family-tree-site .
#   docker run -p 8080:8080 reactive-family-tree-site
#
# SITE_URL is where the site will be reached, for its links and the address it gives search engines.
# DEMO_APP_URL is optional: the address of a running demo of the app, which the site then links to.

FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
# The packages are fetched from the lockfile alone, so a change to the source does not fetch them all again
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
ARG SITE_URL
ARG DEMO_APP_URL=""
RUN test -n "$SITE_URL" || { echo "Set SITE_URL with --build-arg."; exit 1; }
RUN SITE_URL="$SITE_URL" PUBLIC_DEMO_APP_URL="$DEMO_APP_URL" pnpm --filter @reactive-family-tree/site build

FROM nginxinc/nginx-unprivileged:stable-alpine AS run
COPY docker/site-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/site/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
