# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Public map configuration is supplied at runtime; never put credentials in build args.
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    KANVAS_PUBLIC_URL=http://127.0.0.1:8787 \
    KANVAS_ALLOW_REGISTRATION=false \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client-15 \
    && node node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/LICENSE /app/NOTICE ./
COPY --from=build --chown=node:node /app/docs/licenses ./docs/licenses
RUN mkdir -p /app/.kanvas && chown node:node /app/.kanvas && chmod 700 /app/.kanvas
USER node
EXPOSE 8787
VOLUME ["/app/.kanvas"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "--input-type=module", "--eval", "const r = await fetch('http://127.0.0.1:' + (process.env.PORT ?? '8787') + '/healthz', {signal: AbortSignal.timeout(4000)}); if (!r.ok) process.exit(1);"]
CMD ["node", "dist/server/index.js"]
