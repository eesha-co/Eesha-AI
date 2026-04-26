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

# Install runtime dependencies (python for code execution, git, sqlite3, etc.)
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

# Download logo from GitHub during build
RUN curl -L -o /app/public/logo.png "https://raw.githubusercontent.com/eesha000009-dev/Eesha-AI/main/ChatGPT%20Image%20Apr%2026%2C%202026%2C%2012_02_40%20PM.png" || echo "Logo download failed, using fallback"
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Set environment variables for runtime
ENV WORKSPACE_ROOT=/app/workspace
ENV DATABASE_URL=file:/app/data/eeshai.db

# Expose HF Space port
EXPOSE 7860

# Create startup script that initializes DB with raw SQL before starting
RUN cat > /app/start.sh << 'SQLEOF'
#!/bin/sh
cd /app

# Initialize SQLite database with schema
DB_PATH="/app/data/eeshai.db"
if [ ! -f "$DB_PATH" ] || [ ! -s "$DB_PATH" ]; then
  echo "Initializing database..."
  sqlite3 "$DB_PATH" "
    CREATE TABLE IF NOT EXISTS Conversation (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS Message (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      thinking TEXT,
      conversationId TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS Message_conversationId_idx ON Message(conversationId);
  "
  echo "Database initialized!"
else
  echo "Database already exists."
fi

echo "Eesha AI starting on port 7860..."
node server.js
SQLEOF
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
