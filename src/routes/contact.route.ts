import express from 'express';

import { createContactController, getAllContactsController } from '@src/controllers';
import { createContactValidation, isAdmin, isAuth } from '@src/middlewares';

const router = express.Router();

// Public endpoint - anyone can submit a contact form
router.post('/', createContactValidation, createContactController);

// Admin endpoint - get all contacts (requires authentication and admin role)
router.get('/admin/all', isAuth, isAdmin, getAllContactsController);

export = router;

