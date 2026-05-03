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
# Copy pg module for DB migration and email template updates
COPY --from=builder /app/node_modules/pg ./node_modules/pg
# pg-connection-string is a dependency of pg — needed for connection string parsing
COPY --from=builder /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
# Copy prisma CLI for runtime schema sync (prisma db push)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# Copy email template update script
COPY --from=builder /app/scripts ./scripts

# SECURITY: Create non-root user and set permissions
# The node:20-slim image already has a 'node' user (UID 1000), so we reuse it
# instead of creating a duplicate user which would cause useradd to fail.
RUN chown -R node:node /app /app/workspace /app/data

# Set environment variables for runtime
# NOTE: The following MUST be set as HF Spaces Secrets:
#   DATABASE_URL, DIRECT_URL — Supabase PostgreSQL connection strings
#   NEXTAUTH_SECRET, NEXTAUTH_URL — NextAuth.js configuration
#   SUPABASE_URL, SUPABASE_SERVICE_KEY — Supabase Auth admin (server-side only)
#   SUPABASE_ANON_KEY — Supabase Auth public key (server-side only, NOT NEXT_PUBLIC_)
#   SUPABASE_ACCESS_TOKEN — (optional) For email template updates via Management API
#   SUPABASE_DB_PASSWORD — (optional) For direct DB email template updates
#   GITHUB_ID, GITHUB_SECRET — GitHub OAuth
#   AGENT1_API_KEY, AGENT2_API_KEY, AGENT3_API_KEY — NVIDIA API keys
ENV WORKSPACE_ROOT=/app/workspace

# Expose HF Space port
EXPOSE 7860

# Create startup script
RUN cat > /app/start.sh << 'SQLEOF'
#!/bin/sh
cd /app

echo "Eesha AI starting on port 7860..."
echo "Database: PostgreSQL (Supabase)"
echo "Auth: NextAuth.js"

# Sync Prisma schema to database (creates tables, adds new columns like passwordHash)
echo "Syncing database schema..."
npx prisma db push --skip-generate 2>&1 || echo "Warning: Prisma db push failed (IPv4/IPv6 issue on HF Spaces)"

# Ensure required Supabase tables exist (fallback using REST API if Prisma can't connect)
echo "Checking required database tables..."
node scripts/ensure-tables.js 2>/dev/null || echo "Warning: Table check failed (non-fatal)"

# Update Supabase email templates to use OTP codes instead of links
echo "Updating email templates..."
node scripts/update-email-templates.js 2>/dev/null || echo "Warning: Email template update failed (non-fatal)"

node server.js
SQLEOF
RUN chmod +x /app/start.sh

# SECURITY: Run as non-root user (node user already exists in node:20-slim)
USER node

CMD ["/app/start.sh"]
