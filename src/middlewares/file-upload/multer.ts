import { Request, Express } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import createHttpError from 'http-errors';
import fs from 'fs';
import path from 'path';

import { getImageExtension } from '@src/utils';

type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;

// Check if running in serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Set Storage Engine
// In serverless, use memory storage; otherwise use disk storage
export const fileStorage = isServerless
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (request: Request, file: Express.Multer.File, callback: DestinationCallback): void => {
        console.log(request.originalUrl, 'request.originalUrl');
        // eslint-disable-next-line no-nested-ternary
        const fileName = request.originalUrl.includes('products')
          ? 'products'
          : // eslint-disable-next-line no-nested-ternary
          request.originalUrl.includes('posts') || request.originalUrl.includes('feed')
          ? 'posts'
          : request.originalUrl.includes('categories')
          ? 'categories'
          : 'users';
        
        const uploadPath = `public/uploads/${fileName}`;
        
        // Ensure directory exists (only in non-serverless)
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        callback(null, uploadPath);
      },

      filename: (req: Request, file: Express.Multer.File, callback: FileNameCallback): void => {
        if (process?.env?.NODE_ENV && process.env.NODE_ENV === 'development') {
          console.log(file);
        }
        const imageExtension = getImageExtension(file.mimetype);
        if (!imageExtension) {
          // @ts-ignore
          callback(createHttpError(422, 'Invalid request (File type is not supported)'), false);
          return;
        }
        callback(null, `${file.fieldname}-${uuidv4()}${imageExtension}`);
      },
    });

// Initialize upload variable
export const uploadImage = multer({
  storage: fileStorage,
  limits: {
    fileSize: 1024 * 1024 * 10, // accept files up 10 mgb
  },
});

export const customMulterConfig = multer({
  storage: multer.diskStorage({}),
  limits: {
    fileSize: 1024 * 1024 * 10, // accept files up 10 mgb
  },
  fileFilter: (request: Request, file: Express.Multer.File, callback: multer.FileFilterCallback) => {
    if (!getImageExtension(file.mimetype)) {
      // @ts-ignore
      callback(createHttpError(422, 'Invalid request (File type is not supported)'), false);
      return;
    }
    callback(null, true);
  },
});

export default { uploadImage };
