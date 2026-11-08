FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY services/programming-assistant/package.json services/programming-assistant/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true; else npm ci --strict-ssl=true; fi
COPY services/programming-assistant/evaluation-models.ts services/programming-assistant/evaluation-models-entry.ts ./
RUN npx esbuild evaluation-models-entry.ts --bundle --platform=node --format=esm --packages=external --outfile=evaluation.mjs
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production APP_ENV=pilot SUPPORT_EVALUATION_ACTION=dry-run
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/evaluation.mjs ./evaluation.mjs
USER node
CMD ["node", "evaluation.mjs"]
