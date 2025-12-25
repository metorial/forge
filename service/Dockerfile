# Production Dockerfile for Forge Service
FROM oven/bun:1 AS base

# Install curl for health checks
RUN apt-get update && \
    apt-get install -y curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies stage
FROM base AS deps

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS builder

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including devDependencies for Prisma generation)
RUN bun install --frozen-lockfile

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN bun prisma generate

# Copy source code
COPY src ./src
COPY tsconfig.json ./tsconfig.json

# Production stage
FROM base AS runner

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy generated Prisma client from builder
COPY --from=builder /app/prisma/generated ./prisma/generated

# Copy Prisma schema (needed for db push)
COPY --from=builder /app/prisma ./prisma

# Copy source code
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create non-root user for security
RUN groupadd -r forge && useradd -r -g forge forge && \
    chown -R forge:forge /app

USER forge

# Expose port
EXPOSE 52020

# Health check using curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:52020/ping || exit 1

# Start command: push schema and start service
CMD ["sh", "-c", "bun prisma db push && bun src/server.ts"]
