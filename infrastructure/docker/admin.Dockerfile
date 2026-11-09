# syntax=docker/dockerfile:1.7
# MOSHINA BOR web admin: static build served by nginx, which also proxies /v1 to the API
FROM node:22-bookworm-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
COPY packages/api-types/package.json packages/api-types/
COPY admin/package.json admin/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter @moshina/admin...
COPY packages ./packages
COPY admin ./admin
RUN cd admin && npx tsc -p tsconfig.app.json && npx vite build

FROM nginx:1.27-alpine AS runtime
RUN rm /etc/nginx/conf.d/default.conf
COPY infrastructure/docker/nginx-admin.conf /etc/nginx/templates/default.conf.template
COPY infrastructure/docker/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/admin/dist /usr/share/nginx/html
ENV API_UPSTREAM=api:3000 SERVER_NAME=_
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/healthz || exit 1
