import dotenv from 'dotenv-safe';
import fs from 'fs';
import path from 'path';

// Check if running in serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Configure dotenv-safe
// In serverless environments, skip .env.example check since env vars come from Vercel
if (isServerless) {
  // In serverless, use regular dotenv or skip if env vars are already set
  try {
    // Try to use regular dotenv if .env exists, otherwise skip (env vars are already set)
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      require('dotenv').config();
    }
    // If .env doesn't exist, assume env vars are already set by Vercel
  } catch (error) {
    // Ignore - env vars are already available in Vercel
    console.warn('Skipping dotenv in serverless environment (env vars already set)');
  }
} else {
  // In local development, use dotenv-safe with .env.example validation
  try {
    dotenv.config();
  } catch (error: any) {
    // If .env.example doesn't exist, fall back to regular dotenv
    if (error.code === 'ENOENT' && error.path && error.path.includes('.env.example')) {
      console.warn('.env.example not found, using regular dotenv');
      require('dotenv').config();
    } else {
      throw error;
    }
  }
}

export const environmentConfig = {
  MONGODB_CONNECTION_STRING: process.env.MONGODB_CONNECTION_STRING,
  TEST_ENV_MONGODB_CONNECTION_STRING: process.env.TEST_ENV_MONGODB_CONNECTION_STRING,
  TOKEN_SECRET: process.env.TOKEN_SECRET,
  WEBSITE_URL: process.env.WEBSITE_URL,
  API_URL: process.env.API_URL,
  API_VERSION: process.env.API_VERSION,
  JWT_EXPIRE_TIME: process.env.JWT_EXPIRE_TIME,
  PORT: process.env.PORT || 8000,
  SEND_GRID_API_KEY: process.env.SEND_GRID_API_KEY,
  ADMIN_SEND_GRID_EMAIL: process.env.ADMIN_SEND_GRID_EMAIL,
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL,
  ACCESS_TOKEN_SECRET_KEY: process.env.ACCESS_TOKEN_SECRET_KEY,
  REFRESH_TOKEN_SECRET_KEY: process.env.REFRESH_TOKEN_SECRET_KEY,
  ACCESS_TOKEN_KEY_EXPIRE_TIME: process.env.ACCESS_TOKEN_KEY_EXPIRE_TIME,
  REFRESH_TOKEN_KEY_EXPIRE_TIME: process.env.REFRESH_TOKEN_KEY_EXPIRE_TIME,
  JWT_ISSUER: process.env.JWT_ISSUER,
  BASE_URL: process.env.BASE_URL,
  REST_PASSWORD_LINK_EXPIRE_TIME: process.env.REST_PASSWORD_LINK_EXPIRE_TIME,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  MANGER_EMAILS: process.env.MANGER_EMAILS,
  MODERATOR_EMAILS: process.env.MODERATOR_EMAILS,
  SUPERVISOR_EMAILS: process.env.SUPERVISOR_EMAILS,
  GUIDE_EMAILS: process.env.GUIDE_EMAILS,
  CLIENT_EMAILS: process.env.CLIENT_EMAILS,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USERNAME: process.env.SMTP_USERNAME,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_SERVICE: process.env.SMTP_SERVICE,
  DEFAULT_ADMIN_WHATSAPP: process.env.DEFAULT_ADMIN_WHATSAPP,
  ORDER_NOTIFICATION_EMAIL: process.env.ORDER_NOTIFICATION_EMAIL,
};

export default environmentConfig;
