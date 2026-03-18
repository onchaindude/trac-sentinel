# TracSentinel — Backend
# Build:   docker build -t trac-sentinel .
# Run:     docker run -p 4000:4000 --env-file apps/backend/.env trac-sentinel

FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies (monorepo root + backend workspace)
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
RUN npm ci --workspace=apps/backend --ignore-scripts

# Copy source
COPY apps/backend ./apps/backend

# Build TypeScript
WORKDIR /app/apps/backend
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:22-alpine AS prod
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=base /app/apps/backend/dist ./apps/backend/dist
COPY --from=base /app/apps/backend/package.json ./apps/backend/package.json

WORKDIR /app/apps/backend
ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
