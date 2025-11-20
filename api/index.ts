import type { VercelRequest, VercelResponse } from '@vercel/node';
// Use relative paths to avoid TypeScript path alias issues in Vercel
import app from '../src/app';
import { connectDB, environmentConfig } from '../src/configs/index';
import mongoose from 'mongoose';

// Initialize database connection (cached for serverless)
async function connectToDatabase() {
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      return;
    }

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
    // Don't throw - let the app handle requests even if DB fails
    // Individual routes can handle DB errors
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
      // Continue even if DB connection fails - some routes might not need DB
    }
  }
}

// Initialize DB connection when module loads (non-blocking)
ensureDatabaseConnection().catch((err) => {
  console.error('Initial DB connection attempt failed:', err);
});

// Vercel serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Ensure database is connected (non-blocking, won't crash if it fails)
    ensureDatabaseConnection().catch((err) => {
      console.error('DB connection error in handler:', err);
    });

    // Handle the request with Express app
    // @vercel/node automatically converts Express app to serverless function
    if (!app) {
      return res.status(500).json({ error: 'Application not initialized' });
    }

    // Call the Express app - it will handle the request/response
    return app(req, res);
  } catch (error: any) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

