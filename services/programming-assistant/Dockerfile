FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY services/programming-assistant/package.json services/programming-assistant/package-lock.json ./
RUN npm ci
COPY services/programming-assistant ./services/programming-assistant
COPY shared ./shared
RUN npx esbuild services/programming-assistant/index.ts --bundle --platform=node --format=esm --packages=external --outfile=assistant.mjs
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production APP_ENV=pilot
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/assistant.mjs ./assistant.mjs
COPY --chown=node:node server ./server
COPY --chown=node:node client/src ./client/src
COPY --chown=node:node shared ./shared
COPY --chown=node:node docs ./docs
USER node
CMD ["node", "assistant.mjs"]
