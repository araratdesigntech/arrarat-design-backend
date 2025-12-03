import Joi from 'joi';

// @ts-ignore
import JoiObjectId from 'joi-objectid';

const vaildObjectId = JoiObjectId(Joi);

export const productSchema = {
  addProduct: Joi.object({
    productImages: Joi.array()
      .items(
        Joi.object()
          .keys({
            filename: Joi.string().required().label('Invalid request (Please upload Image)'),
          })
          .required()
          .label('Invalid request (Please upload Image)')
      )
      .required(),
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().min(15).required(),
    price: Joi.number().required(),
    category: Joi.string(),
    stock: Joi.string(),
    count: Joi.number(),
  }),
  updateProduct: Joi.object({
    productId: vaildObjectId().required(),
    name: Joi.string().min(3).max(100),
    description: Joi.string().min(15),
    price: Joi.number(),
    category: Joi.string(),
    stock: Joi.string(),
    mobileNumber: Joi.string(),
    gender: Joi.string(),
    productImages: Joi.array()
      .items(
        Joi.object()
          .keys({
            filename: Joi.string().required().label('Invalid request (Please upload Image)'),
          })
          .required()
          .label('Invalid request (Please upload Image)')
      )
      .optional()
      .allow(null, ''),
    count: Joi.number(),
  }),
  reviewProduct: Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    comment: Joi.string().min(3).max(300).required(),
    productId: vaildObjectId().required().label('Invalid request (Please please provide vaild product id)'),
  }),
  validatedProductId: Joi.object({
    productId: vaildObjectId().required(),
  }),
};

export default productSchema;
