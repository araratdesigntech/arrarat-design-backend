import mongoose, { Schema } from 'mongoose';

import { CategoryT } from '@src/interfaces';

export const CategorySchema: Schema<CategoryT> = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide name'],
      maxLength: 100,
      minlength: 3,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Please provide description'],
      // maxLength: 500,
      minlength: 15,
      trim: true,
      lowercase: true,
    },
    image: {
      type: String,
      required: [false, 'Please provide category image'],
      trim: true,
    },
    cloudinary_id: {
      type: String,
    },
    minimumAmount: {
      type: Number,
      required: false,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

CategorySchema.post('save', function () {
  if (process?.env?.NODE_ENV && process.env.NODE_ENV === 'development') {
    console.log('Middleware called after saving the product is (product is been Save )', this);
  }
});

export default mongoose.models.Category || mongoose.model<CategoryT>('Category', CategorySchema);
