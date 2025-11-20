# Production URLs Configuration

This document outlines the production URLs that need to be configured for the Ararat Designs application.

## Frontend URLs

- **User Frontend**: `https://araratdesigns.org`
- **Admin Frontend**: `https://admin.araratdesigns.org`
- **API Backend**: `https://api.araratdesigns.org`

## Environment Variables for Vercel

The following environment variables should be set in your Vercel project settings:

### Required Environment Variables

1. **WEBSITE_URL**
   - **Production Value**: `https://araratdesigns.org`
   - **Purpose**: Used for email verification links and password reset links
   - **Used in**: 
     - `src/services/auth.service.ts` - Email verification links
     - `src/services/admin.service.ts` - Admin email verification
     - `src/services/auth.service.ts` - Password reset links

2. **CLIENT_URL**
   - **Production Value**: `https://araratdesigns.org`
   - **Purpose**: Client-facing frontend URL

3. **BASE_URL**
   - **Production Value**: `https://araratdesigns.org` or `https://admin.araratdesigns.org` (depending on context)
   - **Purpose**: Base URL for email templates and links

4. **API_URL**
   - **Production Value**: `https://api.araratdesigns.org`
   - **Purpose**: API endpoint URL

### CORS Configuration

The CORS configuration in `src/app.ts` has been updated to allow requests from:
- `https://araratdesigns.org`
- `https://www.araratdesigns.org`
- `https://admin.araratdesigns.org`
- Development URLs (localhost)

## Frontend Configuration

Both frontend projects (`ararat-user` and `arrarat-admin`) have been configured to:
- Use `https://api.araratdesigns.org/api/v1` as the API base URL in production
- Use `http://localhost:8000/api/v1` for local development

## Setting Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables for **Production** environment:
   - `WEBSITE_URL` = `https://araratdesigns.org`
   - `CLIENT_URL` = `https://araratdesigns.org`
   - `BASE_URL` = `https://araratdesigns.org`
   - `API_URL` = `https://api.araratdesigns.org`

4. For **Development/Preview** environments, you can use:
   - `WEBSITE_URL` = `http://localhost:5500` (or your local dev URL)
   - `CLIENT_URL` = `http://localhost:5500`
   - `BASE_URL` = `http://localhost:5500`
   - `API_URL` = `http://localhost:8000`

## Email Links

The following email links will be generated using `WEBSITE_URL`:

- **Email Verification**: `${WEBSITE_URL}/verify-email?id={userId}&token={token}`
- **Password Reset**: `${WEBSITE_URL}/admin/reset-password.html?id={userId}&token={token}`
- **Password Reset Confirmation**: `${WEBSITE_URL}/login`

Make sure these paths exist in your frontend applications.

