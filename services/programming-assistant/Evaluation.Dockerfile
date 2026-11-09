FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY services/programming-assistant/package.json services/programming-assistant/package-lock.json ./
RUN npm ci --strict-ssl=true
COPY services/programming-assistant ./services/programming-assistant
COPY shared ./shared
RUN npx esbuild services/programming-assistant/evaluation-models-entry.ts --bundle --platform=node --format=esm --packages=external --outfile=evaluation.mjs
RUN npx esbuild services/programming-assistant/codex-evaluate.ts --bundle --platform=node --format=esm --packages=external --outfile=evaluator.mjs
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production APP_ENV=pilot SUPPORT_EVALUATION_ACTION=dry-run
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/evaluation.mjs ./evaluation.mjs
COPY --from=build --chown=node:node /app/evaluator.mjs ./evaluator.mjs
COPY --chown=node:node services/programming-assistant/evaluation ./evaluation
COPY --chown=node:node server ./server
COPY --chown=node:node client/src ./client/src
COPY --chown=node:node shared ./shared
COPY --chown=node:node docs ./docs
USER node
CMD ["node", "evaluation.mjs"]
