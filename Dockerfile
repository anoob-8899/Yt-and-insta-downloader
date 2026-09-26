# ==================================================
# MEDIAFLOW WORKER SERVICE - PRODUCTION DOCKERFILE
# ==================================================
FROM node:20-alpine

# Install FFmpeg, Python3, CA certificates, and curl
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/cache/apk/*

# Download and install latest standalone yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY worker ./worker
COPY lib ./lib
COPY tsconfig.json ./tsconfig.json

# Create worker runtime storage directory and non-root system user
RUN addgroup -S mediaflow && adduser -S mediaflow -G mediaflow
RUN mkdir -p worker/temp && chown -R mediaflow:mediaflow /app

# Switch to non-root user for security hardening
USER mediaflow

# Expose worker HTTP port
EXPOSE 3001

# Operational environment defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV WORKER_PORT=3001
ENV WORKER_HOST=0.0.0.0

# Launch MediaFlow Worker Service
CMD ["npx", "tsx", "worker/src/index.ts"]
