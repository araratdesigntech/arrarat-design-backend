# Vercel Deployment Setup

This document explains the changes made to enable Vercel serverless function deployment.

## Changes Made

### 1. Created Vercel Serverless Function Handler
- **File**: `api/index.ts`
- This is the entry point for Vercel serverless functions
- Handles database connection initialization
- Wraps the Express app for serverless execution

### 2. Created Vercel Configuration
- **File**: `vercel.json`
- Configures Vercel to use `@vercel/node` builder
- Routes all requests to the serverless function
- Includes necessary files in the build

### 3. Updated Database Connection
- **File**: `src/configs/db.config.ts`
- Added connection caching for serverless environments
- Prevents creating multiple database connections per request

### 4. Updated Server Entry Point
- **File**: `src/server.ts`
- Only starts HTTP server when NOT in Vercel environment
- Prevents `app.listen()` from running in serverless functions

### 5. Fixed File Path Issues
- **File**: `src/app.ts`
- Fixed Swagger YAML file loading for serverless environments
- Added error handling for file path resolution

### 6. Added Dependencies
- Added `@vercel/node` to `package.json` dependencies

## Deployment Steps

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Set Environment Variables in Vercel**:
   - Go to your Vercel project settings
   - Add all environment variables from your `.env` file
   - **Important**: Make sure `MONGODB_CONNECTION_STRING` is set

3. **Deploy to Vercel**:
   ```bash
   vercel
   ```
   Or connect your GitHub repository to Vercel for automatic deployments

## Important Notes

- **Database Connections**: The database connection is now cached and reused across serverless function invocations
- **Static Files**: Static files in the `public` directory should be accessible via `/static` route
- **Environment Variables**: All environment variables must be set in Vercel's dashboard
- **Cold Starts**: First request may be slower due to database connection initialization

## Troubleshooting

### Serverless Function Crashes

1. **Check Environment Variables**:
   - Ensure all required environment variables are set in Vercel
   - Verify `MONGODB_CONNECTION_STRING` is correct

2. **Check Database Connection**:
   - Verify MongoDB connection string is accessible from Vercel
   - Check if MongoDB allows connections from Vercel's IP ranges

3. **Check Logs**:
   - View function logs in Vercel dashboard
   - Look for specific error messages

4. **Build Issues**:
   - Ensure TypeScript compiles successfully
   - Check that all dependencies are in `package.json`

## Local Development

The code still works locally. The server will start normally when running:
```bash
npm run dev
```

The Vercel-specific code only activates when deployed to Vercel.

