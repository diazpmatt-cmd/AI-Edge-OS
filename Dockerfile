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

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/ai-edge-solutions/dist/public ./artifacts/ai-edge-solutions/dist/public

# DAB-6C fixed read-only context allowlist. No repository traversal or .git data is copied.
RUN mkdir -p /app/context/docs/roadmaps
COPY --from=builder /app/AGENTS.md /app/context/AGENTS.md
COPY --from=builder /app/replit.md /app/context/replit.md
COPY --from=builder /app/ROADMAP.md /app/context/ROADMAP.md
COPY --from=builder /app/CHANGELOG.md /app/context/CHANGELOG.md
COPY --from=builder /app/SESSION_HANDOFF.md /app/context/SESSION_HANDOFF.md
COPY --from=builder /app/docs/roadmaps/AI-EDGE-AUTONOMY-ROADMAP.md /app/context/docs/roadmaps/AI-EDGE-AUTONOMY-ROADMAP.md

# DAB-7B read-only preparation snapshot. Only approved text source roots are packaged;
# no .git, environment files, secrets, uploads, logs, generated assets, or credentials.
RUN mkdir -p /app/preparation-source/artifacts/api-server /app/preparation-source/artifacts/ai-edge-solutions /app/preparation-source/docs/roadmaps /app/preparation-source/lib
COPY --from=builder /app/artifacts/api-server/src /app/preparation-source/artifacts/api-server/src
COPY --from=builder /app/artifacts/ai-edge-solutions/src /app/preparation-source/artifacts/ai-edge-solutions/src
COPY --from=builder /app/lib /app/preparation-source/lib
COPY --from=builder /app/AGENTS.md /app/preparation-source/AGENTS.md
COPY --from=builder /app/replit.md /app/preparation-source/replit.md
COPY --from=builder /app/ROADMAP.md /app/preparation-source/ROADMAP.md
COPY --from=builder /app/CHANGELOG.md /app/preparation-source/CHANGELOG.md
COPY --from=builder /app/SESSION_HANDOFF.md /app/preparation-source/SESSION_HANDOFF.md
COPY --from=builder /app/docs/roadmaps/AI-EDGE-AUTONOMY-ROADMAP.md /app/preparation-source/docs/roadmaps/AI-EDGE-AUTONOMY-ROADMAP.md
RUN find /app/preparation-source -type d -exec chmod 0555 {} \; && find /app/preparation-source -type f -exec chmod 0444 {} \;

RUN mkdir -p artifacts/api-server/uploads artifacts/api-server/public/audio /tmp/dab-preparation

ENV NODE_ENV=production
ENV DAB_AGENT_CONTEXT_ROOT=/app/context
ENV DAB_PREPARATION_SOURCE_ROOT=/app/preparation-source
ENV DAB_PREPARATION_SANDBOX_ROOT=/tmp/dab-preparation

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
