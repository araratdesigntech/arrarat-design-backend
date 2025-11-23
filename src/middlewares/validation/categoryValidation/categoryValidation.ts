import { RequestHandler } from 'express';
import validator from '../validator';
import { categorySchema } from './categorySchema';

export const addCategoryValidation: RequestHandler = (req, res, next) => {
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
  
  // If no file at all, filename will be undefined and validation will fail with the proper error message
  
  return validator(
    categorySchema.addCategory,
    {
      filename: filename,
      ...req.body,
    },
    next
  );
};
export const updateCategoryValidation: RequestHandler = (req, res, next) =>
  validator(categorySchema.updateCategory, { ...req.file, ...req.body, ...req.params }, next);

export const categoryIdValidation: RequestHandler = (req, res, next) => {
  return validator(categorySchema.validatedCategoryId, { ...req.file, ...req.body, ...req.params }, next);
};
