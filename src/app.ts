// Import all the dependencies
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import colors from 'colors';

// Handle unhandled rejection error (inlined to avoid path alias issues in Vercel)
// Check if running in serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

process.on('unhandledRejection', (reason: Error | any) => {
  const message = reason?.message || reason || 'Unknown error';
  console.error(`Unhandled Rejection: ${message}`);

  // In serverless environments, don't throw - just log
  // Throwing in unhandledRejection crashes the serverless function
  if (!isServerless) {
    throw new Error(message);
  }
});

process.on('uncaughtException', (error: Error) => {
  console.error(`Uncaught Exception: ${error.message}`);
  // In serverless, don't exit - let Vercel handle it
  if (!isServerless) {
    // process.exit(1);
  }
});

// Import Routes
import api from '@src/api';

// Import Middleware
import { errorHandlerMiddleware, notFoundMiddleware } from '@src/middlewares';
// Import Api Docs
import path from 'path';

// Handle file paths for both local and serverless environments
const swaggerPath = path.join(process.cwd(), 'swagger', 'swagger.yaml');
let swaggerDocument: any;
try {
  swaggerDocument = YAML.load(swaggerPath);
} catch (error) {
  // Fallback for serverless environments
  console.warn('Could not load swagger.yaml, Swagger UI may not work:', error);
  swaggerDocument = {};
}

// Access Environment variables
// Note: dotenv-safe is configured in custom-environment-variables.config.ts
// No need to call it here again - it's already handled there with serverless support

colors.enable();

// Initialize app with express
const app: express.Application = express();

// Load App Middleware
app.use(morgan('dev'));
app.use(helmet());

const corsOptions = {
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'https://arrarat-designs.onrender.com',
  ],
  methods: 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  credentials: true,
};

app.use(cors(corsOptions));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  })
);

// Serve all static files inside public directory.
app.use('/static', express.static('public'));

// Routes which Should handle the requests
app.use('/api/v1', api);
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export default app;
