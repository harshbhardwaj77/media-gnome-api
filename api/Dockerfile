# Multi-stage build for Node.js API
FROM node:20-alpine AS builder

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --no-audit --no-fund

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S app && \
    adduser -S app -u 1001

# Create app directory
WORKDIR /app

# Copy built application and node_modules from builder
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package*.json ./

# Create directories for data and ensure proper ownership
RUN mkdir -p /opt/media-pipeline/data && \
    chown -R app:app /opt/media-pipeline

# Switch to non-root user
USER app

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "const http = require('http'); \
                 const req = http.request({hostname: '127.0.0.1', port: 8081, path: '/healthz', timeout: 2000}, \
                 (res) => process.exit(res.statusCode === 200 ? 0 : 1)); \
                 req.on('error', () => process.exit(1)); \
                 req.end();"

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]