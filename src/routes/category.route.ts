import express from 'express';
import {
  createCategoryController,
  deleteCategoryController,
  getCategoriesController,
  getCategoryController,
  updateCategoryController,
} from '@src/controllers/category.controller';
import { categoryPaginationMiddleware, isAuth, uploadImage } from '@src/middlewares';
import {
  addCategoryValidation,
  categoryIdValidation,
  updateCategoryValidation,
} from '@src/middlewares/validation/categoryValidation';

const router = express.Router();

router.get('/', categoryPaginationMiddleware(), getCategoriesController);
router.post('/', uploadImage.single('image'), isAuth, addCategoryValidation, createCategoryController);
router.get('/:categoryId', categoryIdValidation, getCategoryController);
router.delete('/:categoryId', isAuth, categoryIdValidation, deleteCategoryController);
router.patch('/:categoryId', uploadImage.single('image'), isAuth, updateCategoryValidation, updateCategoryController);

export = router;
