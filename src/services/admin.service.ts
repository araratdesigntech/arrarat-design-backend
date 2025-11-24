import { NextFunction, Request, Response } from 'express';
import createHttpError, { InternalServerError } from 'http-errors';
import { SignOptions } from 'jsonwebtoken';

import Token from '@src/models/Token.model';
import User from '@src/models/User.model';
import Order from '@src/models/Order.model';
import Post from '@src/models/Post.model';
import Product from '@src/models/Product.model';
import { authorizationRoles } from '@src/constants';
import { cloudinary } from '@src/middlewares';
import { environmentConfig } from '@src/configs/custom-environment-variables.config';

import {
  AuthenticatedRequestBody,
  IUser,
  IPost,
  ProcessingOrderT,
  ProductT,
  ResponseT,
  TPaginationResponse,
  UpdateCommentT,
} from '@src/interfaces';
import { customResponse, deleteFile, isValidMongooseObjectId, sendEmailVerificationEmail } from '@src/utils';

export const adminAddUserService = async (req: Request, res: Response<ResponseT<null>>, next: NextFunction) => {
  const {
    email,
    password,
    name,
    surname,
    confirmPassword,
    jobTitle,
    bio,
    favoriteAnimal,
    mobileNumber,
    gender,
    dateOfBirth,
    address,
    nationality,
    companyName,
    role,
  } = req.body;

  const PWD = process.env.PWD || process.cwd();
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

  try {
    const isEmailExit = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
    if (isEmailExit) {
      // Clean up uploaded file if it exists (only in local development)
      if (req.file?.filename && !isServerless) {
        const localFilePath = `${PWD}/public/uploads/users/${req.file.filename}`;
        deleteFile(localFilePath);
      }
      return next(createHttpError(422, `E-Mail address ${email} is already exists, please pick a different one.`));
    }

    let cloudinaryResult;
    if (req.file) {
      try {
        if (isServerless && req.file.buffer) {
          // In serverless (Vercel), file is in memory - upload directly from buffer
          cloudinaryResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'users' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(req.file.buffer);
          });
        } else if (req.file.filename) {
          // Local development: file is on disk
          const localFilePath = `${PWD}/public/uploads/users/${req.file.filename}`;

          cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
            folder: 'users',
          });

          // Image has been successfully uploaded on cloudinary
          // So we don't need local image file anymore
          // Remove file from local uploads folder
          deleteFile(localFilePath);
        }
      } catch (uploadError) {
        // If Cloudinary upload fails, log error but continue with user creation
        // User will be created without profile image
        console.error('Cloudinary upload error during admin user creation:', uploadError);
        // Clean up local file if it exists (local development only)
        if (req.file.filename && !isServerless) {
          const localFilePath = `${PWD}/public/uploads/users/${req.file.filename}`;
          deleteFile(localFilePath);
        }
        // Continue without profile image - cloudinaryResult will remain undefined
      }
    }

    const newUser = new User({
      email,
      password,
      name,
      surname,
      confirmPassword,
      jobTitle,
      bio,
      favoriteAnimal,
      mobileNumber,
      gender,
      dateOfBirth,
      role,
      address,
      nationality,
      companyName,
      profileImage: cloudinaryResult?.secure_url || null,
      cloudinary_id: cloudinaryResult?.public_id || null,
      acceptTerms: true,
    });

    const user = await newUser.save();
    let token = await new Token({ userId: user._id });

    const payload = {
      userId: user._id,
    };

    const accessTokenSecretKey = environmentConfig.ACCESS_TOKEN_SECRET_KEY as string;
    const accessTokenOptions: SignOptions = {
      expiresIn: environmentConfig.ACCESS_TOKEN_KEY_EXPIRE_TIME,
      issuer: environmentConfig.JWT_ISSUER,
      audience: String(user._id),
    };

    const refreshTokenSecretKey = environmentConfig.REFRESH_TOKEN_SECRET_KEY as string;
    const refreshTokenJwtOptions: SignOptions = {
      expiresIn: environmentConfig.REFRESH_TOKEN_KEY_EXPIRE_TIME,
      issuer: environmentConfig.JWT_ISSUER,
      audience: String(user._id),
    };

    // Generate and set verify email token
    const generatedAccessToken = await token.generateToken(payload, accessTokenSecretKey, accessTokenOptions);
    const generatedRefreshToken = await token.generateToken(payload, refreshTokenSecretKey, refreshTokenJwtOptions);

    // Save the updated token
    token.refreshToken = generatedRefreshToken;
    token.accessToken = generatedAccessToken;
    token = await token.save();

    const verifyEmailLink = `${environmentConfig.WEBSITE_URL}/verify-email?id=${user._id}&token=${token.refreshToken}`;

    // send mail for email verification
    sendEmailVerificationEmail(email, name, verifyEmailLink);

    const data = {
      user: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        verifyEmailLink,
      },
    };

    return res.status(201).json(
      customResponse<any>({
        data,
        success: true,
        error: false,
        message: `Auth Signup is success. An Email with Verification link has been sent to your account ${user.email} Please Verify Your Email first or use the email verification lik which is been send with the response body to verfiy your email`,
        status: 201,
      })
    );
  } catch (error) {
    // Remove file from local uploads folder
    if (req.file?.filename) {
      const localFilePath = `${PWD}/public/uploads/users/${req.file?.filename}`;
      deleteFile(localFilePath);
    }
    // Clean up uploaded file if it exists (only in local development)
    const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (req.file?.filename && !isServerless) {
      const localFilePath = `${PWD}/public/uploads/users/${req.file.filename}`;
      deleteFile(localFilePath);
    }
    return next(InternalServerError);
  }
};

export const adminUpdateAuthService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  const {
    name,
    surname,
    email,
    dateOfBirth,
    gender,
    mobileNumber,
    bio,
    companyName,
    nationality,
    address,
    favoriteAnimal,
    jobTitle,
    acceptTerms,
    // role,
  } = req.body;

  const PWD = process.env.PWD || process.cwd();

  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return next(new createHttpError.BadRequest());
    }

    // Admin cant update them roles
    if (req.body.role && req.user?._id.equals(user._id) && req.body.role !== authorizationRoles.admin) {
      return next(
        createHttpError(403, `Auth Failed (Admin cant remove themselves from admin , please ask another admin)`)
      );
    }

    if (email) {
      const existingUser = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
      if (existingUser && !existingUser._id.equals(user._id)) {
        const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
        if (req.file?.filename && !isServerless) {
          const localFilePath = `${PWD}/public/uploads/users/${req.file.filename}`;
          deleteFile(localFilePath);
        }
        return next(createHttpError(422, `E-Mail address ${email} is already exists, please pick a different one.`));
      }
    }

    const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

    if (req.file && user.cloudinary_id) {
      // Delete the old image from cloudinary
      await cloudinary.uploader.destroy(user.cloudinary_id);
    }

    let cloudinaryResult;
    if (req.file) {
      try {
        if (isServerless && req.file.buffer) {
          // In serverless (Vercel), file is in memory - upload directly from buffer
          cloudinaryResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'users' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(req.file.buffer);
          });
        } else if (req.file.filename) {
          // Local development: file is on disk
          const localFilePath = `${PWD}/public/uploads/users/${req.file.filename}`;

          cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
            folder: 'users',
          });

          // Image has been successfully uploaded on cloudinary
          // So we don't need local image file anymore
          // Remove file from local uploads folder
          deleteFile(localFilePath);
        }
      } catch (uploadError) {
        // If Cloudinary upload fails, log error but continue with user update
        // User will be updated without changing profile image
        console.error('Cloudinary upload error during admin user update:', uploadError);
        // Clean up local file if it exists (local development only)
        if (req.file.filename && !isServerless) {
          const localFilePath = `${PWD}/public/uploads/users/${req.file.filename}`;
          deleteFile(localFilePath);
        }
        // Continue without updating profile image - cloudinaryResult will remain undefined
      }
    }

    user.name = name || user.name;
    user.surname = surname || user.surname;
    user.email = email || user.email;
    user.gender = gender || user.gender;
    user.dateOfBirth = dateOfBirth || user.dateOfBirth;
    user.mobileNumber = mobileNumber || user.mobileNumber;
    user.acceptTerms = acceptTerms || user.acceptTerms;
    user.bio = bio || user.bio;
    user.companyName = companyName || user.companyName;
    user.nationality = nationality || user.nationality;
    user.address = address || user.address;
    user.jobTitle = jobTitle || user.jobTitle;
    user.favoriteAnimal = favoriteAnimal || user.favoriteAnimal;
    user.role = req.body.role || user.role;
    user.status = req.body.status || user.status;
    user.profileImage = req.file ? (cloudinaryResult?.secure_url || user.profileImage) : user.profileImage;
    user.cloudinary_id = req.file ? (cloudinaryResult?.public_id || user.cloudinary_id) : user.cloudinary_id;

    const updatedUser = await user.save({ validateBeforeSave: false, new: true });

    if (!updatedUser) {
      return next(createHttpError(422, `Failed to update user by given ID ${req.params.userId}`));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      password: pass,
      confirmPassword,
      isVerified,
      isDeleted,
      status,
      acceptTerms: acceptTerm,
      role: roles,
      ...otherUserInfo
    } = updatedUser._doc;

    return res.status(200).send(
      customResponse<{ user: IUser }>({
        success: true,
        error: false,
        message: `Successfully updated user by ID: ${req.params.userId}`,
        status: 200,
        data: { user: otherUserInfo },
      })
    );
  } catch (error) {
    // Clean up uploaded file if it exists (only in local development)
    const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (req.file?.filename && !isServerless) {
      const localFilePath = `${PWD}/public/uploads/users/${req.file?.filename}`;
      deleteFile(localFilePath);
    }
    return next(InternalServerError);
  }
};

export const adminGetUsersService = async (_req: Request, res: TPaginationResponse) => {
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

    responseObject.users = results?.map((userDoc: any) => {
      return {
        ...userDoc._doc,
        request: {
          type: 'Get',
          description: 'Get user info',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/admin/users/${userDoc._doc._id}`,
        },
      };
    });

    return res.status(200).send(
      customResponse<typeof responseObject>({
        success: true,
        error: false,
        message: 'Successful Found users',
        status: 200,
        data: responseObject,
      })
    );
  }
};

export const adminGetUserService = async (req: AuthenticatedRequestBody<IUser>, res: Response, next: NextFunction) => {
  if (!isValidMongooseObjectId(req.params.userId) || !req.params.userId) {
    return next(createHttpError(422, `Invalid request`));
  }

  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return next(new createHttpError.BadRequest());
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, confirmPassword, ...otherUserInfo } = user._doc;

    const data = {
      user: {
        ...otherUserInfo,
        request: {
          type: 'Get',
          description: 'Get all the user',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/admin/users`,
        },
      },
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully found user by ID: ${req.params.userId} profile 🍀`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminAddProductService = async (
  req: AuthenticatedRequestBody<ProductT>,
  res: Response,
  next: NextFunction
) => {
  const PWD = process.env.PWD || process.cwd();

  const { name, price, description, category, stock } = req.body;

  // console.log(req.file, req.files);

  const imageUrlList: any[] = [];

  const userId = req?.user?._id || '';

  // Check if running in serverless (memory storage) or local (disk storage)
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

  try {
    if (req.files) {
      for (let index = 0; index < req?.files?.length; index += 1) {
        // @ts-ignore
        const file = req.files && req.files[index];
        
        let cloudinaryResult: { secure_url?: string; public_id?: string } | undefined;
        
        if (isServerless && file.buffer) {
          // In serverless, upload directly from buffer
          cloudinaryResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
            if (!file.buffer) {
              reject(new Error('File buffer is missing'));
              return;
            }
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'products' },
              (error, result) => {
                if (error) reject(error);
                else if (result) resolve(result);
                else reject(new Error('Upload failed: no result'));
              }
            );
            uploadStream.end(file.buffer);
          });
        } else if (file.filename) {
          // Local development: upload from file path
          const localFilePath = `${PWD}/public/uploads/products/${file.filename}`;
          
          // eslint-disable-next-line no-await-in-loop
          cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
            folder: 'products',
          }) as { secure_url: string; public_id: string };

          // Remove file from local uploads folder
          // eslint-disable-next-line no-await-in-loop
          await deleteFile(localFilePath);
        }

        if (cloudinaryResult) {
          imageUrlList.push({
            url: cloudinaryResult?.secure_url,
            cloudinary_id: cloudinaryResult?.public_id,
          });
        }
      }
    }

    const productData = new Product({
      name,
      price,
      description,
      category,
      stock,
      productImages: imageUrlList,
      user: userId,
    });

    const createdProduct = await Product.create(productData);

    const data = {
      product: {
        _id: createdProduct._id,
        name: createdProduct.name,
        price: createdProduct.price,
        description: createdProduct.description,
        productImage: createdProduct.productImage,
        productImages: createdProduct.productImages,
        count: createdProduct.count,
        ratings: createdProduct.ratings,
        stock: createdProduct.stock,
        category: createdProduct.category,
        reviews: createdProduct.reviews,
        numberOfReviews: createdProduct.numberOfReviews,
        user: {
          name: req.user?.name,
          surname: req.user?.surname,
          email: req.user?.email,
          dateOfBirth: req.user?.dateOfBirth,
          gender: req.user?.gender,
          createdAt: req.user?.createdAt,
          updatedAt: req.user?.updatedAt,
          role: req.user?.role,
        },
        request: {
          type: 'Get',
          description: 'Get  all products',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/products`,
        },
      },
    };

    return res.status(201).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: 'Successfully created new product',
        status: 201,
        data,
      })
    );
  } catch (error: any) {
    // Only try to delete local files if not in serverless mode
    if (req.files && !isServerless) {
      for (let index = 0; index < req?.files?.length; index += 1) {
        // @ts-ignore
        const file = req.files && req.files[index];
        if (file?.filename) {
          const localFilePath = `${PWD}/public/uploads/products/${file.filename}`;
          // eslint-disable-next-line no-await-in-loop
          await deleteFile(localFilePath);
        }
      }
    }
    // return next(InternalServerError);
    return next(error);
  }
};

export const adminGetProductsService = async (_req: Request, res: TPaginationResponse) => {
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

    responseObject.products = results?.map((productDoc: any) => {
      const { productImage } = productDoc._doc;
      return {
        ...productDoc._doc,
        productImage: `${process.env.API_URL}${productImage}`,
        request: {
          type: 'Get',
          description: 'Get one product with the id',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/products/${productDoc._doc._id}`,
        },
      };
    });

    return res.status(200).send(
      customResponse<typeof responseObject>({
        success: true,
        error: false,
        message: 'Successful Found products',
        status: 200,
        data: responseObject,
      })
    );
  }
};

export const adminGetProductService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  if (!isValidMongooseObjectId(req.params.productId) || !req.params.productId) {
    return next(createHttpError(422, `Invalid request`));
  }

  try {
    const product = await Product.findById(req.params.productId);

    if (!product) {
      return next(new createHttpError.BadRequest());
    }

    const data = {
      product: {
        ...product._doc,
        request: {
          type: 'Get',
          description: 'Get all the product',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/admin/products`,
        },
      },
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully found product by ID: ${req.params.productId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminUpdateProductService = async (
  req: AuthenticatedRequestBody<ProductT>,
  res: Response,
  next: NextFunction
) => {
  const PWD = process.env.PWD || process.cwd();

  const { name, price, description, category, stock } = req.body;

  // Check if running in serverless (memory storage) or local (disk storage)
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

  try {
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return next(new createHttpError.BadRequest());
    }

    const imageUrlList: any[] = [];

    if (req.files) {
      // Upload new images
      for (let index = 0; index < req?.files?.length; index += 1) {
        // @ts-ignore
        const file = req.files && req.files[index];
        
        let cloudinaryResult: { secure_url?: string; public_id?: string } | undefined;
        
        if (isServerless && file.buffer) {
          // In serverless, upload directly from buffer
          cloudinaryResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
            if (!file.buffer) {
              reject(new Error('File buffer is missing'));
              return;
            }
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'products' },
              (error, result) => {
                if (error) reject(error);
                else if (result) resolve(result);
                else reject(new Error('Upload failed: no result'));
              }
            );
            uploadStream.end(file.buffer);
          });
        } else if (file.filename) {
          // Local development: upload from file path
          const localFilePath = `${PWD}/public/uploads/products/${file.filename}`;

          // eslint-disable-next-line no-await-in-loop
          cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
            folder: 'products',
          }) as { secure_url: string; public_id: string };

          // eslint-disable-next-line no-await-in-loop
          await deleteFile(localFilePath);
        }

        if (cloudinaryResult) {
          imageUrlList.push({
            url: cloudinaryResult?.secure_url,
            cloudinary_id: cloudinaryResult?.public_id,
          });
        }
      }

      // Remove the old images
      product?.productImages?.forEach(async (image: any) => {
        if (image?.cloudinary_id) {
          await cloudinary.uploader.destroy(image.cloudinary_id);
        }
      });

      product.productImages = imageUrlList;
    }

    product.name = name || product.name;
    product.price = price || product.price;
    product.description = description || product.description;
    product.category = category || product.category;
    product.stock = stock || product.stock;
    const updatedProduct = await product.save();

    const data = {
      product: {
        ...updatedProduct._doc,
        user: {
          name: req.user?.name,
          surname: req.user?.surname,
          email: req.user?.email,
          dateOfBirth: req.user?.dateOfBirth,
          gender: req.user?.gender,
          createdAt: req.user?.createdAt,
          updatedAt: req.user?.updatedAt,
          role: req.user?.role,
        },
        request: {
          type: 'Get',
          description: 'Get  all products',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/products`,
        },
      },
    };

    return res.status(200).json(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully update product by ID ${req.params.productId}`,
        status: 200,
        data,
      })
    );
  } catch (error: any) {
    // Only try to delete local files if not in serverless mode
    if (req.files && !isServerless) {
      for (let index = 0; index < req?.files?.length; index += 1) {
        // @ts-ignore
        const file = req.files && req.files[index];
        if (file?.filename) {
          const localFilePath = `${PWD}/public/uploads/products/${file.filename}`;
          // eslint-disable-next-line no-await-in-loop
          await deleteFile(localFilePath);
        }
      }
    }
    return next(InternalServerError);
  }
};

export const adminDeleteProductService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return next(new createHttpError.BadRequest());
    }

    const isDeleted = await product.remove();
    if (!isDeleted) {
      return next(createHttpError(400, `Failed to delete product by given ID ${req.params.productId}`));
    }

    // Remove all the images
    product?.productImages?.forEach(async (image: any) => {
      if (image?.cloudinary_id) {
        await cloudinary.uploader.destroy(image.cloudinary_id);
      }
    });

    // Delete the product image
    // const fullImage = product.productImage || '';
    // const imagePath = fullImage.split('/').pop() || '';
    // const folderFullPath = `${process.env.PWD}/public/uploads/products/${imagePath}`;

    // deleteFile(folderFullPath);

    return res.status(200).json(
      customResponse({
        data: null,
        success: true,
        error: false,
        message: `Successfully deleted product by ID ${req.params.productId}`,
        status: 200,
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // fs.stat(folderFullPath, function (err, stats) {
    //   console.log(stats); // here we got all information of file in stats variable

    //   if (err) {
    //     // console.error(err);
    //     return res.status(200).json(
    //       customResponse({
    //         data: null,
    //         success: true,
    //         error: false,
    //         message: `Successfully deleted product by ID ${req.params.productId} but fail to delete the image`,
    //         status: 200,
    //       })
    //     );
    //   }

    //   fs.unlink(folderFullPath, function (error) {
    //     if (error) return console.log(error);
    //     console.log('file deleted successfully');

    //   });
    // });
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminClearAllProductsService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const products = await Product.find();
    // Delete complete product collection
    const dropCompleteCollection = await Product.deleteMany({});

    if (dropCompleteCollection.deletedCount === 0) {
      return next(createHttpError(400, `Failed to clear posts`));
    }

    // Remove all the images
    products.forEach((product) => {
      product?.productImages?.forEach(async (image: any) => {
        // Delete image from cloudinary
        if (image?.cloudinary_id) {
          await cloudinary.uploader.destroy(image.cloudinary_id);
        }
      });
    });

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        message: `Successful cleared all products`,
        status: 200,
        data: null,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminUpdateOrderStatusService = async (
  req: AuthenticatedRequestBody<ProcessingOrderT>,
  res: Response,
  next: NextFunction
) => {
  const { orderStatus } = req.body;
  if (!isValidMongooseObjectId(req.params.orderId) || !req.params.orderId) {
    return next(createHttpError(422, `Invalid request`));
  }

  try {
    const { orderId } = req.params;
    const order = await Order.findOneAndUpdate(
      { _id: orderId },
      {
        orderStatus,
      },
      {
        new: true,
      }
    )
      .populate('user.userId', '-password -confirmPassword ')
      .populate({
        path: 'orderItems.product',
        populate: { path: 'user', select: '-password -confirmPassword' },
      })
      .exec();

    if (!order) {
      return next(new createHttpError.BadRequest());
    }
    const data = {
      order,
    };

    return res.status(201).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully update order by ID ${orderId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminGetOrdersService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const orders = await Order.find()
      .populate('user.userId', '-password -confirmPassword ')
      .populate({
        path: 'orderItems.product',
        // Get users of product
        populate: { path: 'user', select: '-password -confirmPassword' },
      })
      .exec();

    const data = {
      orders,
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successful Found all orders`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminGetOrderService = async (req: AuthenticatedRequestBody<IUser>, res: Response, next: NextFunction) => {
  if (!isValidMongooseObjectId(req.params.orderId) || !req.params.orderId) {
    return next(createHttpError(422, `Invalid request`));
  }
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId)
      .populate('user.userId', '-password -confirmPassword ')
      .populate({
        path: 'orderItems.product',
        // Get users of product
        populate: { path: 'user', select: '-password -confirmPassword' },
      })
      .exec();

    if (!order) {
      return next(new createHttpError.BadRequest());
    }

    const data = {
      order,
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully found order by ID ${orderId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminGetAllOrdersForGivenUserService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  if (!isValidMongooseObjectId(req.params.userId) || !req.params.userId) {
    return next(createHttpError(422, `Invalid request`));
  }

  try {
    const { userId } = req.params;

    const orders = await Order.find({ 'user.userId': userId })
      .populate('user.userId', '-password -confirmPassword ')
      .populate({
        path: 'orderItems.product',
        populate: { path: 'user', select: '-password -confirmPassword' },
      })
      .exec();

    const data = {
      orders,
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: !orders.length
          ? `No order found for user by ID ${userId}`
          : `Successfully found  all order for user by ID ${userId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminDeleteSingleOrderService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  if (!isValidMongooseObjectId(req.params.orderId) || !req.params.orderId) {
    return next(createHttpError(422, `Invalid request`));
  }

  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new createHttpError.BadRequest());
    }

    const isRemoved = await Order.findByIdAndRemove({
      _id: orderId,
    });

    if (!isRemoved) {
      return next(createHttpError(400, `Failed to delete order by given ID ${orderId}`));
    }

    return res.status(200).json(
      customResponse({
        data: null,
        success: true,
        error: false,
        message: `Successfully deleted order by ID ${orderId}`,
        status: 200,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminDeleteAllOrderForGivenUserService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  if (!isValidMongooseObjectId(req.params.userId) || !req.params.userId) {
    return next(createHttpError(422, `Invalid request`));
  }

  try {
    const { userId } = req.params;
    const droppedUserOrder = await Order.deleteMany({ 'user.userId': userId });

    if (droppedUserOrder.deletedCount === 0) {
      return next(createHttpError(400, `Failed to delete order for given user by ID ${userId}`));
    }

    return res.status(200).json(
      customResponse({
        data: null,
        success: true,
        error: false,
        message: `Successfully deleted all orders for user by ID ${userId}`,
        status: 200,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminClearAllOrdersService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    // Delete complete Order collection
    const dropCompleteCollection = await Order.deleteMany({});

    if (dropCompleteCollection.deletedCount === 0) {
      return next(createHttpError(400, `Failed to Cleared orders`));
    }

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        message: `Successful Cleared all orders`,
        status: 200,
        data: null,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminGetPostsService = async (_req: Request, res: TPaginationResponse) => {
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

    responseObject.posts = results?.map((postDoc: any) => {
      const { author, ...otherPostInfo } = postDoc._doc;
      return {
        ...otherPostInfo,
        creator: author,
        request: {
          type: 'Get',
          description: 'Get one post with the id',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/admin/feed/posts/${postDoc._doc._id}`,
        },
      };
    });

    return res.status(200).send(
      customResponse<typeof responseObject>({
        success: true,
        error: false,
        message: responseObject.posts.length ? 'Successful Found posts' : 'No post found',
        status: 200,
        data: responseObject,
      })
    );
  }
};

export const adminGetPostService = async (req: AuthenticatedRequestBody<IUser>, res: Response, next: NextFunction) => {
  try {
    const post = await Post.findById(req.params.postId)
      .populate('author')
      .populate('likes.user')
      .populate('comments.user')
      .exec();

    if (!post) {
      return next(new createHttpError.BadRequest());
    }

    const { author, ...otherPostInfo } = post._doc;

    const data = {
      post: {
        ...otherPostInfo,
        author: undefined,
        creator: author,
        request: {
          type: 'Get',
          description: 'Get all posts',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/admin/feed/posts`,
        },
      },
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully found post by ID: ${req.params.postId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminCreatePostService = async (
  req: AuthenticatedRequestBody<IPost>,
  res: Response,
  next: NextFunction
) => {
  const PWD = process.env.PWD || process.cwd();
  const { title, content, category } = req.body;

  // console.log(req.body, req.file);

  try {
    let cloudinaryResult;
    if (req.file?.filename) {
      const localFilePath = `${PWD}/public/uploads/posts/${req.file?.filename}`;
      cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
        folder: 'posts',
      });

      // Remove file from local uploads folder
      deleteFile(localFilePath);
    }

    const postData = new Post({
      title,
      content,
      category: category?.toLocaleLowerCase(),
      postImage: cloudinaryResult?.secure_url,
      cloudinary_id: cloudinaryResult?.public_id,
      author: req?.user?._id || '',
    });

    const createdPost = await Post.create(postData);

    const data = {
      post: {
        ...createdPost._doc,
        author: undefined,
        creator: req?.user,
      },
      request: {
        type: 'Get',
        description: 'Get all posts',
        url: `${process.env.API_URL}/api/${process.env.API_VERSION}/admin/feed/posts`,
      },
    };

    return res.status(201).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully added new post`,
        status: 201,
        data,
      })
    );
  } catch (error) {
    // Remove file from local uploads folder
    if (req.file?.filename) {
      const localFilePath = `${PWD}/public/uploads/posts/${req.file?.filename}`;
      deleteFile(localFilePath);
    }
    return next(InternalServerError);
  }
};

export const adminDeletePostService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const post = await Post.findByIdAndRemove({
      _id: req.params.postId,
    });

    if (!post) {
      return next(createHttpError(400, `Failed to delete post by given ID ${req.params.postId}`));
    }

    // const fullImage = post.postImage || '';
    // const imagePath = fullImage.split('/').pop() || '';
    // const folderFullPath = `${process.env.PWD}/public/uploads/posts/${imagePath}`;

    // deleteFile(folderFullPath);

    // Delete image from cloudinary
    if (post.cloudinary_id) {
      await cloudinary.uploader.destroy(post.cloudinary_id);
    }

    return res.status(200).json(
      customResponse({
        data: null,
        success: true,
        error: false,
        message: `Successfully deleted post by ID ${req.params.postId}`,
        status: 200,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminDeleteAllPostForGivenUserService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;
    const posts = await Post.find({
      author: userId,
    });

    if (!posts || !posts.length) {
      return next(new createHttpError.BadRequest());
    }

    const droppedUserPost = await Post.deleteMany({
      author: userId,
    });

    if (droppedUserPost.deletedCount === 0) {
      return next(createHttpError(400, `Failed to delete post for given user by ID ${userId}`));
    }

    // Remove all the images
    posts.forEach(async (post) => {
      if (post?.cloudinary_id) {
        await cloudinary.uploader.destroy(post?.cloudinary_id);
      }
    });

    return res.status(200).json(
      customResponse({
        data: null,
        success: true,
        error: false,
        message: `Successfully deleted all posts for user by ID ${userId}`,
        status: 200,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminClearAllPostsService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const posts = await Post.find();
    // Delete complete post collection
    const dropCompleteCollection = await Post.deleteMany({});

    if (dropCompleteCollection.deletedCount === 0) {
      return next(createHttpError(400, `Failed to clear posts`));
    }

    // Remove all the images
    posts.forEach(async (post) => {
      if (post?.cloudinary_id) {
        await cloudinary.uploader.destroy(post?.cloudinary_id);
      }
    });

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        message: `Successful Cleared all posts`,
        status: 200,
        data: null,
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const adminUpdatePostService = async (
  req: AuthenticatedRequestBody<IPost>,
  res: Response,
  next: NextFunction
) => {
  const PWD = process.env.PWD || process.cwd();

  const { title, content, category } = req.body;

  try {
    const post = await Post.findById(req.params.postId).populate('author').exec();

    if (!post) {
      return next(new createHttpError.BadRequest());
    }

    if (post.cloudinary_id && req.file?.filename) {
      // Delete the old image from cloudinary
      await cloudinary.uploader.destroy(post.cloudinary_id);
    }

    let cloudinaryResult;
    if (req.file?.filename) {
      const localFilePath = `${PWD}/public/uploads/posts/${req.file?.filename}`;

      cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
        folder: 'posts',
      });

      deleteFile(localFilePath);
    }

    post.title = title || post.title;
    post.content = content || post.content;
    post.category = category || post.category;
    post.cloudinary_id = req.file?.filename ? cloudinaryResult?.public_id : post.cloudinary_id;
    post.postImage = req.file?.filename ? cloudinaryResult?.secure_url : post.postImage;

    const updatedPost = await post.save({ new: true });

    const data = {
      post: {
        ...updatedPost._doc,
        author: undefined,
        creator: updatedPost._doc.author,
        request: {
          type: 'Get',
          description: 'Get all posts',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/admin/feed/posts`,
        },
      },
    };

    return res.status(200).json(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully update post by ID ${req.params.postId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminDeleteAllCommentInPostService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const post = await Post.findById(req.params.postId);

    if (!post || !post.comments.length) {
      return next(new createHttpError.BadRequest());
    }

    post.comments = [];
    await post.save();

    const { author, ...otherPostInfo } = post._doc;

    const data = {
      post: {
        ...otherPostInfo,
        author: undefined,
        creator: author,
        request: {
          type: 'Get',
          description: 'Get all posts',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/feed/posts`,
        },
      },
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully deleted all comments in post by ID : ${req.params.postId} `,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const adminDeleteCommentInPostService = async (
  req: AuthenticatedRequestBody<UpdateCommentT>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { postId, commentId } = req.body;

    const post = await Post.findById(postId)
      .populate('author', 'name  surname  profileImage  bio')
      .populate('likes.user', 'name  surname  profileImage bio')
      .populate('comments.user', 'name  surname  profileImage bio')
      .exec();

    if (!post) {
      return next(new createHttpError.BadRequest());
    }

    const isAuthorized = post.comments.find(
      (item: { user: IUser; _id: string }) => item?._id.toString() === commentId.toString()
    );

    if (!isAuthorized) {
      return next(createHttpError(403, `Auth Failed (Unauthorized)`));
    }

    post.comments = post.comments.filter(
      (item: { user: IUser; _id: string }) => item?._id.toString() !== commentId?.toString()
    );

    await post.save();

    const { author, ...otherPostInfo } = post._doc;

    const data = {
      post: {
        ...otherPostInfo,
        author: undefined,
        creator: author,
        request: {
          type: 'Get',
          description: 'Get all posts',
          url: `${process.env.API_URL}/api/${process.env.API_VERSION}/feed/posts`,
        },
      },
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully delete comment by ID : ${commentId} `,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};
