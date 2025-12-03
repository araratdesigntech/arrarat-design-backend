import { RequestHandler } from 'express';
import validator from '../validator';
import { productSchema } from './productSchema';

export const addProductValidation: RequestHandler = (req, res, next) => {
  // Check if running in serverless (memory storage) or local (disk storage)
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  // Transform req.files array to include filename for validation
  // In memory storage (serverless), files have buffer and originalname but NOT filename
  // In disk storage (local), files have filename
  let productImages = req.files;
  
  if (productImages && Array.isArray(productImages)) {
    productImages = productImages.map((file: Express.Multer.File) => {
      // If file doesn't have filename, use originalname (serverless mode)
      if (!file.filename) {
        if (isServerless && file.buffer) {
          // In serverless, file is in memory - use originalname
          return {
            ...file,
            filename: file.originalname || 'uploaded-image',
          };
        } else if (file.originalname) {
          // Fallback: use originalname if available
          return {
            ...file,
            filename: file.originalname,
          };
        }
      }
      // If filename exists, return as is
      return file;
    });
  }
  
  return validator(
    productSchema.addProduct,
    {
      productImages: productImages,
      ...req.body,
    },
    next
  );
};

export const updateProductValidation: RequestHandler = (req, res, next) => {
  // Check if running in serverless (memory storage) or local (disk storage)
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  // Transform req.files array to include filename for validation
  // In memory storage (serverless), files have buffer and originalname but NOT filename
  // In disk storage (local), files have filename
  let productImages = req.files;
  
  // Only process and include productImages if files are actually uploaded
  // For updates, images are optional
  if (productImages && Array.isArray(productImages) && productImages.length > 0) {
    productImages = productImages.map((file: Express.Multer.File) => {
      // If file doesn't have filename, use originalname (serverless mode)
      if (!file.filename) {
        if (isServerless && file.buffer) {
          // In serverless, file is in memory - use originalname
          return {
            ...file,
            filename: file.originalname || 'uploaded-image',
          };
        } else if (file.originalname) {
          // Fallback: use originalname if available
          return {
            ...file,
            filename: file.originalname,
          };
        }
      }
      // If filename exists, return as is
      return file;
    });
  } else {
    // No files uploaded - set to undefined so it's not included in validation
    productImages = undefined;
  }
  
  // Build validation data - only include productImages if files were uploaded
  const validationData: any = {
    ...req.params,
    ...req.body,
  };
  
  // Only add productImages to validation if files were actually uploaded
  if (productImages && Array.isArray(productImages) && productImages.length > 0) {
    validationData.productImages = productImages;
  }
  
  return validator(
    productSchema.updateProduct,
    validationData,
    next
  );
};

export const reviewProductValidation: RequestHandler = (req, res, next) =>
  validator(productSchema.reviewProduct, { ...req.body }, next);

export const productIdValidation: RequestHandler = (req, res, next) =>
  validator(productSchema.validatedProductId, { ...req.body, ...req.params }, next);
