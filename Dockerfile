FROM node:24-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm exec tsc --build lib/db/tsconfig.json lib/api-zod/tsconfig.json

RUN pnpm --filter @workspace/ai-edge-solutions run build
RUN pnpm --filter @workspace/api-server run build

RUN pnpm deploy --filter @workspace/api-server --prod --legacy /deploy

FROM node:24-slim AS runner
WORKDIR /app

COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/ai-edge-solutions/dist/public ./artifacts/ai-edge-solutions/dist/public

RUN mkdir -p artifacts/api-server/uploads artifacts/api-server/public/audio

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
