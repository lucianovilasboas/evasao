# syntax=docker/dockerfile:1

# ---- dependências ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3060
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache python3 py3-pandas py3-openpyxl \
  && addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/etl ./etl
COPY --from=build /app/dados/geo ./dados/geo
RUN mkdir -p dados/brutos dados/incoming && chown -R nextjs:nodejs dados

USER nextjs
EXPOSE 3060

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3060/api/dados?view=meta" >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
