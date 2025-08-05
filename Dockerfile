# ================================================================
# LIVE TRANSCRIPTION EXTENSION - DOCKER BUILD CONTAINER
# ================================================================
# Multi-stage Docker build for secure, reproducible extension builds
# Supports environment-specific builds and security scanning

# ================================================================
# STAGE 1: Base Node.js Environment
# ================================================================
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies for extension building
RUN apk add --no-cache \
    git \
    zip \
    unzip \
    curl \
    bash

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S extension -u 1001

# ================================================================
# STAGE 2: Dependencies Installation
# ================================================================
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# ================================================================
# STAGE 3: Development Build Environment
# ================================================================
FROM base AS dev-deps

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci && \
    npm cache clean --force

# ================================================================
# STAGE 4: Build Stage
# ================================================================
FROM dev-deps AS builder

# Copy source code
COPY . .

# Create build argument for environment
ARG BUILD_ENV=production
ARG BROWSER=chrome

# Set environment variables for build
ENV NODE_ENV=production
ENV VITE_APP_ENV=${BUILD_ENV}

# Build arguments for runtime injection
ARG VITE_DEEPGRAM_API_KEY
ARG VITE_ENABLE_ANALYTICS=true
ARG VITE_EXTENSION_VERSION=1.0.0
ARG VITE_BUILD_TIME
ARG VITE_BUILD_COMMIT

# Validate required environment variables
RUN if [ -z "$VITE_DEEPGRAM_API_KEY" ]; then \
        echo "❌ ERROR: VITE_DEEPGRAM_API_KEY is required"; \
        exit 1; \
    fi

# Build the extension
RUN npm run build:${BROWSER}

# Validate build output
RUN if [ ! -d "build/${BROWSER}" ]; then \
        echo "❌ ERROR: Build failed - output directory missing"; \
        exit 1; \
    fi

# Security scan: Check for exposed secrets
RUN if grep -r "DEEPGRAM_API_KEY\|sk-\|pk_" build/${BROWSER}/ 2>/dev/null; then \
        echo "❌ SECURITY VIOLATION: Secrets found in build output!"; \
        exit 1; \
    fi

# Package the extension
RUN npm run package:${BROWSER}

# ================================================================
# STAGE 5: Production Image
# ================================================================
FROM alpine:3.18 AS production

# Install runtime dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    zip \
    curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S extension -u 1001

# Set working directory
WORKDIR /app

# Copy built extension from builder stage
COPY --from=builder --chown=extension:nodejs /app/build ./build
COPY --from=builder --chown=extension:nodejs /app/dist ./dist

# Copy package.json for metadata
COPY --from=builder --chown=extension:nodejs /app/package.json ./

# Switch to non-root user
USER extension

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD test -d /app/build && test -d /app/dist || exit 1

# Default command
CMD ["sh", "-c", "echo 'Extension built successfully!' && ls -la build/ dist/"]

# ================================================================
# STAGE 6: CI/CD Testing Image
# ================================================================
FROM dev-deps AS testing

# Copy source and build artifacts
COPY . .
COPY --from=builder /app/build ./build

# Install browser dependencies for testing
RUN npm install -g playwright && \
    npx playwright install chromium firefox

# Run tests
CMD ["npm", "run", "test"]

# ================================================================
# LABELS AND METADATA
# ================================================================
FROM production AS final

LABEL maintainer="Live Transcription Team"
LABEL description="Live Transcription Extension - Browser Extension Build Container"
LABEL version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/your-org/live-transcription-extension"
LABEL org.opencontainers.image.description="Secure, containerized build for Live Transcription Extension"
LABEL org.opencontainers.image.licenses="MIT"

# Build arguments as labels
ARG BUILD_DATE
ARG BUILD_VERSION
ARG BUILD_COMMIT

LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.version="${BUILD_VERSION}"
LABEL org.opencontainers.image.revision="${BUILD_COMMIT}"