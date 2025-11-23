import { RequestHandler } from 'express';
import validator from '../validator';
import { userSchema } from './userSchema';

export const signupUserValidation: RequestHandler = (req, res, next) => {
  // Check if running in serverless (memory storage) or local (disk storage)
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  // For validation, we need to ensure filename exists
  // In memory storage (serverless), req.file has buffer and originalname but NOT filename
  // In disk storage (local), req.file has filename
  let filename: string | undefined;
  
  if (req.file) {
    // File exists - check for filename based on storage type
    if (isServerless) {
      // In serverless, file is in memory - use originalname
      filename = req.file.originalname || 'uploaded-image';
    } else {
      // In local, use filename if available, otherwise fallback to originalname
      filename = req.file.filename || req.file.originalname;
    }
  }
  
  return validator(
    userSchema.signupUser,
    {
      filename: filename,
      ...req.body,
    },
    next
  );
};

export const loginUserValidation: RequestHandler = (req, res, next) => validator(userSchema.loginUser, req.body, next);

export const updateUserValidation: RequestHandler = (req, res, next) => {
  // Check if running in serverless (memory storage) or local (disk storage)
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  // For validation, filename is optional in update
  let filename: string | undefined;
  
  if (req.file) {
    // File exists - check for filename based on storage type
    if (isServerless) {
      // In serverless, file is in memory - use originalname
      filename = req.file.originalname || 'uploaded-image';
    } else {
      // In local, use filename if available, otherwise fallback to originalname
      filename = req.file.filename || req.file.originalname;
    }
  }
  
  return validator(
    userSchema.updateUser,
    {
      filename: filename,
      ...req.body,
      ...req.params,
    },
    next
  );
};

export const verifyUserMailValidation: RequestHandler = (req, res, next) => {
  return validator(userSchema.verifyUserMail, req.params, next);
};

export const refreshTokenValidation: RequestHandler = (req, res, next) =>
  validator(userSchema.refreshToken, req.body, next);

export const sendVerificationMailValidation: RequestHandler = (req, res, next) =>
  validator(userSchema.sendVerificationMail, req.body, next);

export const resetPasswordValidation: RequestHandler = (req, res, next) =>
  validator(userSchema.resetPassword, { ...req.body, ...req.params }, next);

export const userIdValidation: RequestHandler = (req, res, next) => {
  return validator(userSchema.validatedUserId, req.params, next);
};
