import { RequestHandler } from 'express';
import validator from '../validator';
import { postSchema } from './postSchema';

export const addPostValidation: RequestHandler = (req, res, next) => {
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
    postSchema.addPost,
    {
      filename: filename,
      ...req.body,
    },
    next
  );
};

export const updatePostValidation: RequestHandler = (req, res, next) => {
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
    postSchema.updatePost,
    {
      filename: filename,
      ...req.body,
      ...req.params,
    },
    next
  );
};

export const postIdValidation: RequestHandler = (req, res, next) => {
  return validator(postSchema.validatedPostId, { ...req.file, ...req.body, ...req.params }, next);
};

export const commentIdValidation: RequestHandler = (req, res, next) => {
  return validator(postSchema.validatedCommentId, { ...req.file, ...req.body, ...req.params }, next);
};

export const addCommentValidation: RequestHandler = (req, res, next) =>
  validator(postSchema.addComment, { ...req.file, ...req.body, ...req.params }, next);

export const updateCommentValidation: RequestHandler = (req, res, next) => {
  return validator(postSchema.updateComment, { ...req.file, ...req.body, ...req.params }, next);
};

export const deleteCommentValidation: RequestHandler = (req, res, next) => {
  return validator(postSchema.deleteComment, { ...req.file, ...req.body, ...req.params }, next);
};
