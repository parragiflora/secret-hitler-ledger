# Multi-stage build for the whole npm-workspaces monorepo. The final image
# runs a single process (packages/server/dist/index.js) that serves the API,
# the WebSocket connection, and the built client -- see packages/server/src/
# index.ts's express.static wiring.

FROM node:22-slim AS builder
WORKDIR /app

# Install deps first (better layer caching) -- copy every workspace's
# package.json before `npm ci` needs them.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# npm workspaces hoists everything to one root node_modules (with symlinks
# for the @interhuman/* packages) -- copying just this one directory
# resolves every package's dependencies, workspace ones included.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

EXPOSE 8787
CMD ["node", "packages/server/dist/index.js"]
