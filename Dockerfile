# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# System deps for native modules (pdfkit, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install tsx globally so it's always in PATH regardless of devDep resolution
RUN npm install -g tsx

COPY package*.json ./

# Install all project deps. --ignore-scripts avoids hanging postinstall hooks.
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

# Build using the globally-installed tsx
RUN tsx script/build.ts

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Production deps only — much lighter, avoids OOM
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
