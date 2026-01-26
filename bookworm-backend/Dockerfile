# ---- Base Stage ----
FROM node:18-alpine AS base
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com \
  && npm config set fetch-retry-maxtimeout 600000 \
  && npm config set fetch-retry-mintimeout 10000 \
  && npm config set fetch-retries 5
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma \
    npm_config_fetch_retry_maxtimeout=600000 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retries=5

# ---- Dependencies Stage ----
FROM base AS dependencies
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# ---- Build Stage ----
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm install --ignore-scripts
RUN ./node_modules/.bin/prisma generate
RUN ./node_modules/.bin/prisma -v
RUN npm run build
RUN mkdir -p dist && cp -r public dist/public

# ---- Production Stage ----
FROM base
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY package.json .
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/assets/legal ./assets/legal
COPY --from=builder /app/scripts/ensure_legal_content.mjs ./scripts/ensure_legal_content.mjs
COPY --from=builder /app/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
