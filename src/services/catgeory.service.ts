import { NextFunction, Response, Request } from 'express';
import createHttpError, { InternalServerError } from 'http-errors';
import { Error } from 'mongoose';

import { AuthenticatedRequestBody, CategoryT, IUser, TPaginationResponse } from '@src/interfaces';
import { cloudinary } from '@src/middlewares';
import { customResponse, deleteFile } from '@src/utils';
import Category from '@src/models/Category.model';

const PWD = process.env.PWD || process.cwd();

export const createCategoryService = async (
  req: AuthenticatedRequestBody<CategoryT>,
  res: Response,
  next: NextFunction
) => {
  const { name, description } = req.body;

  try {
    let cloudinaryResult: { secure_url?: string; public_id?: string } | undefined;
    if (req.file) {
      // Check if running in serverless (memory storage) or local (disk storage)
      const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
      
      if (isServerless && req.file.buffer) {
        // In serverless, upload directly from buffer
        cloudinaryResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
          if (!req.file?.buffer) {
            reject(new Error('File buffer is missing'));
            return;
          }
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'categories' },
            (error, result) => {
              if (error) reject(error);
              else if (result) resolve(result);
              else reject(new Error('Upload failed: no result'));
            }
          );
          uploadStream.end(req.file.buffer);
        });
      } else if (req.file.filename) {
        // Local development: upload from file path
        const localFilePath = `${PWD}/public/uploads/categories/${req.file.filename}`;
        cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
          folder: 'categories',
        }) as { secure_url: string; public_id: string };

        // Remove file from local uploads folder
        deleteFile(localFilePath);
      }
    }

    const postData = new Category({
      name,
      description,
      image: cloudinaryResult?.secure_url,
      cloudinary_id: cloudinaryResult?.public_id,
    });

    const createdCategory = await Category.create(postData);

    const data = {
      category: {
        ...createdCategory._doc,
      },
      request: {
        type: 'Get',
        description: 'Get all Category',
        url: `${process.env.API_URL}/api/${process.env.API_VERSION}/category`,
      },
    };

    return res.status(201).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully added new Category`,
        status: 201,
        data: createdCategory,
      })
    );
  } catch (error) {
    console.log(error, 'error');

    // File Cleanup on Error (only for local file storage, not serverless)
    const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (!isServerless && req.file?.filename) {
      const localFilePath = `${PWD}/public/uploads/categories/${req.file.filename}`;
      deleteFile(localFilePath);
    }

    if (error instanceof Error.ValidationError) {
      // Get an array of all error messages
      const errorMessages = Object.values(error.errors).map((err) => err.message);

      // Join the messages into one string
      const fullErrorMessage = errorMessages.join(' | ');

      next(createHttpError(400, fullErrorMessage));
    } else if (error instanceof Error.CastError) {
      // Mongoose Cast Error (e.g., invalid ID format)
      next(createHttpError(400, `Invalid data format for field: ${error.path}`));
    } else if (error && (error as any).code === 11000) {
      // Mongoose Duplicate Key Error (e.g., unique name constraint violation)
      const field = Object.keys((error as any).keyValue)[0];
      const message = `A category with that ${field} already exists.`;
      next(createHttpError(400, message));
    } else {
      // Catch all other errors (network issues, unexpected server errors, etc.)
      next(InternalServerError);
    }
  }
};

export const getCategoriesService = async (_req: Request, res: TPaginationResponse) => {
  if (res?.paginatedResults) {
    const { results, next, previous, currentPage, totalDocs, totalPages, lastPage } = res.paginatedResults;
    const responseObject: any = {
      totalDocs: totalDocs || 0,
      totalPages: totalPages || 0,
      lastPage: lastPage || 0,
      count: results?.length || 0,
      currentPage: currentPage || 0,
    };

    if (next) {
      responseObject.nextPage = next;
    }
    if (previous) {
      responseObject.prevPage = previous;
    }

    responseObject.categories = (results as Array<{ _doc: CategoryT }>).map((createdDoc) => {
      return {
        ...createdDoc._doc,
        request: {
          type: 'Get',
          description: 'Get all categories',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/categories`,
        },
      };
    });

    return res.status(200).send(
      customResponse<typeof responseObject>({
        success: true,
        error: false,
        message: responseObject.categories.length ? 'Successful Found category' : 'No post found',
        status: 200,
        data: responseObject,
      })
    );
  }
};

export const getCategoryService = async (req: AuthenticatedRequestBody<IUser>, res: Response, next: NextFunction) => {
  try {
    const category = await Category.findById(req.params.categoryId).exec();

    if (!category) {
      return next(new createHttpError.BadRequest());
    }

    const data = {
      category: {
        ...category._doc,
        request: {
          type: 'Get',
          description: 'Get all categories',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/categories`,
        },
      },
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully found category by ID: ${req.params.categoryId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    console.log(error, 'error');
    return next(InternalServerError);
  }
};

export const updateCategoryService = async (
  req: AuthenticatedRequestBody<CategoryT>,
  res: Response,
  next: NextFunction
) => {
  const { name, description } = req.body;

  try {
    const category = await Category.findById(req.params.categoryId).exec();

    if (!category) {
      return next(new createHttpError.BadRequest());
    }

    const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (category.cloudinary_id && req.file && (isServerless ? req.file.buffer : req.file.filename)) {
      // Delete the old image from cloudinary
      await cloudinary.uploader.destroy(category.cloudinary_id);
    }

    let cloudinaryResult: { secure_url?: string; public_id?: string } | undefined;
    if (req.file) {
      // Check if running in serverless (memory storage) or local (disk storage)
      const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
      
      if (isServerless && req.file.buffer) {
        // In serverless, upload directly from buffer
        cloudinaryResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
          if (!req.file?.buffer) {
            reject(new Error('File buffer is missing'));
            return;
          }
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'categories' },
            (error, result) => {
              if (error) reject(error);
              else if (result) resolve(result);
              else reject(new Error('Upload failed: no result'));
            }
          );
          uploadStream.end(req.file.buffer);
        });
      } else if (req.file.filename) {
        // Local development: upload from file path
        const localFilePath = `${PWD}/public/uploads/categories/${req.file.filename}`;
        cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
          folder: 'categories',
        }) as { secure_url: string; public_id: string };

        deleteFile(localFilePath);
      }
    }

    category.name = name || category.name;
    category.description = description || category.description;

    if (req.file && cloudinaryResult) {
      category.image = cloudinaryResult.secure_url || category.image;
      category.cloudinary_id = cloudinaryResult.public_id || category.cloudinary_id;
    }

    const updatedCategory = await category.save({ new: true });

    const data = {
      category: {
        ...updatedCategory._doc,
        request: {
          type: 'Get',
          description: 'Get all categories',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/categories`,
        },
      },
    };

    return res.status(200).json(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully update category by ID ${req.params.postId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    console.log(error, 'error');

    // File Cleanup on Error (only for local file storage, not serverless)
    const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (!isServerless && req.file?.filename) {
      const localFilePath = `${PWD}/public/uploads/categories/${req.file.filename}`;
      deleteFile(localFilePath);
    }

    if (error instanceof Error.ValidationError) {
      // Get an array of all error messages
      const errorMessages = Object.values(error.errors).map((err) => err.message);

      // Join the messages into one string
      const fullErrorMessage = errorMessages.join(' | ');

      next(createHttpError(400, fullErrorMessage));
    } else if (error instanceof Error.CastError) {
      // Mongoose Cast Error (e.g., invalid ID format)
      next(createHttpError(400, `Invalid data format for field: ${error.path}`));
    } else if (error && (error as any).code === 11000) {
      // Mongoose Duplicate Key Error (e.g., unique name constraint violation)
      const field = Object.keys((error as any).keyValue)[0];
      const message = `A category with that ${field} already exists.`;
      next(createHttpError(400, message));
    } else {
      // Catch all other errors (network issues, unexpected server errors, etc.)
      next(InternalServerError);
    }
  }
};

export const deleteCategoryService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const category = await Category.findById(req.params.categoryId).exec();

    if (!category) {
      return next(new createHttpError.BadRequest());
    }

    // Allow user to delete only category which is created by them
    if (req?.user?.role !== 'admin') {
      return next(createHttpError(403, `Auth Failed (Unauthorized)`));
    }

    const isDeleted = await Category.findByIdAndRemove({
      _id: req.params.categoryId,
    });

    if (!isDeleted) {
      return next(createHttpError(400, `Failed to delete category by given ID ${req.params.categoryId}`));
    }

    // const fullImage = post.postImage || '';
    // const imagePath = fullImage.split('/').pop() || '';
    // const folderFullPath = `${process.env.PWD}/public/uploads/posts/${imagePath}`;

    // deleteFile(folderFullPath);

    // Delete image from cloudinary
    if (category.cloudinary_id) {
      await cloudinary.uploader.destroy(category.cloudinary_id);
    }

    return res.status(200).json(
      customResponse({
        data: null,
        success: true,
        error: false,
        message: `Successfully deleted post by ID ${req.params.categoryId}`,
        status: 200,
      })
    );
  } catch (error) {
    console.log(error, 'error');
    return next(InternalServerError);
  }
};
