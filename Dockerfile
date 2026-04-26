# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Install runtime dependencies (python for code execution, git, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    curl \
    wget \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7860
ENV HOST=0.0.0.0

# Create directories
RUN mkdir -p /app/workspace /app/data

# Copy built application
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy prisma CLI for db push
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Set environment variables for runtime
ENV WORKSPACE_ROOT=/app/workspace
ENV DATABASE_URL=file:/app/data/eeshai.db

# Expose HF Space port
EXPOSE 7860

# Create startup script that initializes DB before starting
RUN cat > /app/start.sh << 'EOF'
#!/bin/sh
cd /app

# Initialize database
echo "Initializing database..."
export DATABASE_URL="file:/app/data/eeshai.db"
npx prisma db push --skip-generate 2>&1 || echo "DB push failed, continuing..."

echo "Eesha AI starting on port 7860..."
node server.js
EOF
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
