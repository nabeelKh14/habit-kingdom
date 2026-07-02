# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy lockfile and package.json for caching
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies including devDeps for building/testing
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the server (using the server:build script which uses esbuild)
RUN pnpm run server:build

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Only install production dependencies
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copy build artifacts from builder
COPY --from=builder /app/server_dist ./server_dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/app.json .

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

USER appuser

# Healthcheck using curl (installed via apk)
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:$PORT/api/health || exit 1

EXPOSE $PORT

# Use the prod start command: node server_dist/index.js
CMD ["node", "server_dist/index.js"]
