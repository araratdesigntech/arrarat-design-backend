import type { VercelRequest, VercelResponse } from '@vercel/node';
// Use relative paths to avoid TypeScript path alias issues in Vercel
import app from '../src/app';
import { connectDB, environmentConfig } from '../src/configs/index';

// Initialize database connection (cached for serverless)
async function connectToDatabase() {
  try {
    const env = process.env.NODE_ENV;
    const connectionString =
      env === 'testing'
        ? environmentConfig.TEST_ENV_MONGODB_CONNECTION_STRING
        : environmentConfig.MONGODB_CONNECTION_STRING;

    if (!connectionString) {
      throw new Error('MongoDB connection string is not defined');
    }

    await connectDB(connectionString);
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// Initialize database connection on module load (cached for subsequent requests)
let dbInitialized = false;

async function ensureDatabaseConnection() {
  if (!dbInitialized) {
    try {
      await connectToDatabase();
      dbInitialized = true;
    } catch (error) {
      console.error('Failed to initialize database connection:', error);
      // Don't throw here, let individual requests handle the error
    }
  }
}

// Vercel serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure database is connected (connection is cached in db.config.ts)
  await ensureDatabaseConnection();

  // Handle the request with Express app
  // @vercel/node automatically converts Express app to serverless function
  return app(req, res);
}

