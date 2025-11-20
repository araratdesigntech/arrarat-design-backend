import logger from '@src/logger';

// Check if running in serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

process.on('unhandledRejection', (reason: Error | any) => {
  const message = reason?.message || reason || 'Unknown error';
  console.error(`Unhandled Rejection: ${message}`);

  // In serverless environments, don't throw - just log
  // Throwing in unhandledRejection crashes the serverless function
  if (!isServerless) {
    throw new Error(message);
  } else {
    // In serverless, just log the error
    logger.error({
      message: `Unhandled Rejection: ${message}`,
    });
  }
});

process.on('uncaughtException', (error: Error) => {
  console.error(`Uncaught Exception: ${error.message}`);

  logger.error({
    message: `Uncaught Exception: ${error.message}`,
  stack: error.stack,
  });

  // In serverless, don't exit - let Vercel handle it
  // In regular server, you might want to exit, but for serverless we don't
  if (!isServerless) {
    // process.exit(1);
  }
});
