import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with error handling
function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    console.error('[DB] DATABASE_URL is not set! Prisma cannot connect to the database.');
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Connection pooling configuration for Supabase
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// Helper to check if database is available
export function isDatabaseAvailable(): boolean {
  return db !== null && db !== undefined;
}
