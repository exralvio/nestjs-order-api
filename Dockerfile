# syntax=docker/dockerfile:1

# --------------------
# Base image with system deps
# --------------------
FROM node:20-bullseye-slim AS base
ENV NODE_ENV=production
# Install system dependencies needed for bcrypt builds and tooling
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     curl \
     gnupg \
     build-essential \
     python3 \
     postgresql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --------------------
# Install production dependencies
# --------------------
FROM base AS deps
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY prisma ./prisma
RUN npx prisma generate

# --------------------
# Builder: install dev deps and build
# --------------------
FROM base AS builder
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build
# Verify build artifacts exist (dist/src/...)
RUN test -f dist/src/main.js && test -f dist/src/consumer/main.js

# --------------------
# Runtime image
# --------------------
FROM base AS runner
ENV NODE_ENV=production
# PM2 to run processes; Prisma CLI for migrate/seed; ts-node/typescript to run seed.ts
RUN npm i -g pm2@5 prisma@5.15.0 ts-node typescript
WORKDIR /app

# Copy production node_modules and built app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./package.json
COPY docker/pm2.config.js ./docker/pm2.config.js
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["/entrypoint.sh"]
