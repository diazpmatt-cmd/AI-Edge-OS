FROM node:24-slim

WORKDIR /app

RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --frozen-lockfile --filter . --filter @workspace/development-control-mcp...
RUN pnpm --filter @workspace/development-control-mcp typecheck

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/healthz').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

USER node

CMD ["node", "artifacts/development-control-mcp/node_modules/tsx/dist/cli.mjs", "artifacts/development-control-mcp/src/server.ts"]
