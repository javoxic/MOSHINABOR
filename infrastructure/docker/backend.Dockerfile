# syntax=docker/dockerfile:1.7
# MOSHINA BOR API / worker image.
# Build stage uses the full Debian image (ships OpenSSL); the runtime is slim and only receives
# the OpenSSL 3 libraries and CA bundle it needs (no package manager access required).
#
# Optional: building behind a TLS-intercepting proxy — pass its CA as a BuildKit secret:
#   docker build --secret id=extra_ca,src=/path/ca.crt -f infrastructure/docker/backend.Dockerfile .

FROM node:22-bookworm AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
COPY packages/api-types/package.json packages/api-types/
COPY backend/package.json backend/
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter @moshina/backend...
COPY packages ./packages
COPY backend ./backend
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter @moshina/shared run build \
 && cd backend && npx prisma generate && npx nest build \
 && cd /repo && pnpm --filter @moshina/backend deploy --prod --legacy /out \
 && cp -r backend/dist backend/prisma /out/ \
 && cd /out && npx prisma generate \
 && mkdir -p /runtime-libs \
 && cp -L $(ldconfig -p | awk '/libssl\.so\.3 |libcrypto\.so\.3 /{print $NF}' | sort -u) /runtime-libs/

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /runtime-libs/ /usr/local/lib/
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN ldconfig \
 && groupadd --system app && useradd --system --gid app --home /app app \
 && mkdir -p /app/storage && chown app:app /app/storage
COPY --from=build --chown=app:app /out /app
COPY --chown=app:app infrastructure/docker/backend-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["api"]
