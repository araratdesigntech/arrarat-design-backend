import { Document } from 'mongoose';

export interface CategoryT extends Document {
  name: string;
  description: string;
  image: string;
  cloudinary_id?: string;
  minimumAmount?: number;
}
