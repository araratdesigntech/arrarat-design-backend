import Joi from 'joi';

// @ts-ignore
import JoiObjectId from 'joi-objectid';

const vaildObjectId = JoiObjectId(Joi);

export const categorySchema = {
  addCategory: Joi.object({
    filename: Joi.string().required().label('Invalid request (Please upload Image)'),
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().min(5).required(),
    minimumAmount: Joi.number().min(0).optional().allow('', null),
  }),
  updateCategory: Joi.object({
    name: Joi.string().optional().allow('', null).custom((value, helpers) => {
      // Only validate min length if value is provided and not empty
      if (value && value.trim().length > 0 && value.trim().length < 3) {
        return helpers.error('string.min');
      }
      if (value && value.length > 100) {
        return helpers.error('string.max');
      }
      return value;
    }).messages({
      'string.min': 'Name must be at least 3 characters long',
      'string.max': 'Name must not exceed 100 characters',
    }),
    description: Joi.string().optional().allow('', null).custom((value, helpers) => {
      // Only validate min length if value is provided and not empty
      if (value && value.trim().length > 0 && value.trim().length < 5) {
        return helpers.error('string.min');
      }
      return value;
    }).messages({
      'string.min': 'Description must be at least 5 characters long',
    }),
    minimumAmount: Joi.number().min(0).optional().allow('', null),
  }),
  validatedCategoryId: Joi.object({
    categoryId: vaildObjectId().required(),
  }),
};
