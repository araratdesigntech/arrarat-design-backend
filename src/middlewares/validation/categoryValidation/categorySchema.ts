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
    name: Joi.string().allow('', null).optional().custom((value, helpers) => {
      // If value is empty, null, or undefined, allow it (skip validation)
      if (!value || value === '' || value === null || (typeof value === 'string' && value.trim() === '')) {
        return value;
      }
      // If value exists and is not empty, validate length
      const trimmed = String(value).trim();
      if (trimmed.length < 3) {
        return helpers.error('any.custom', { message: 'Name must be at least 3 characters long' });
      }
      if (trimmed.length > 100) {
        return helpers.error('any.custom', { message: 'Name must not exceed 100 characters' });
      }
      return value;
    }),
    description: Joi.string().allow('', null).optional().custom((value, helpers) => {
      // If value is empty, null, or undefined, allow it (skip validation)
      if (!value || value === '' || value === null || (typeof value === 'string' && value.trim() === '')) {
        return value;
      }
      // If value exists and is not empty, validate length
      const trimmed = String(value).trim();
      if (trimmed.length < 5) {
        return helpers.error('any.custom', { message: 'Description must be at least 5 characters long' });
      }
      return value;
    }),
    minimumAmount: Joi.alternatives().try(
      Joi.number().min(0),
      Joi.string().allow('', null)
    ).optional(),
  }),
  validatedCategoryId: Joi.object({
    categoryId: vaildObjectId().required(),
  }),
};
