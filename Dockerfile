# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install system deps needed by pdfkit / canvas native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for better layer caching
COPY package*.json ./

# Install everything (devDeps needed for the build step)
# npm install is more memory-efficient than npm ci on constrained containers
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Only production deps — much lighter install, avoids OOM
RUN npm install --omit=dev --legacy-peer-deps

# Copy the compiled output from the builder stage
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
