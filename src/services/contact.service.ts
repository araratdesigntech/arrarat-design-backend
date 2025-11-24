import { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';
import { Error } from 'mongoose';

import { AuthenticatedRequestBody, ContactT, IUser } from '@src/interfaces';
import { customResponse } from '@src/utils';
import Contact from '@src/models/Contact.model';

export const createContactService = async (
  req: Request<{}, {}, ContactT>,
  res: Response,
  next: NextFunction
) => {
  const { name, email, phone, subject, message } = req.body;

  try {
    const contactData = new Contact({
      name,
      email,
      phone,
      subject,
      message,
      status: 'new',
    });

    const createdContact = await Contact.create(contactData);

    return res.status(201).send(
      customResponse({
        success: true,
        error: false,
        status: 201,
        message: 'Contact message submitted successfully. We will get back to you soon!',
        data: {
          contact: createdContact,
        },
      })
    );
  } catch (error) {
    console.error('Error creating contact:', error);

    if (error instanceof Error.ValidationError) {
      const errorMessages = Object.values(error.errors).map((err) => err.message);
      const fullErrorMessage = errorMessages.join(' | ');
      next(createHttpError(400, fullErrorMessage));
    } else {
      next(createHttpError(500, 'Failed to submit contact message'));
    }
  }
};

// Get all contacts for admin
export const getAllContactsService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = {};
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .exec();

    const total = await Contact.countDocuments(query);

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        status: 200,
        message: 'Contacts fetched successfully',
        data: {
          contacts: contacts || [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
      })
    );
  } catch (error) {
    console.error('Error fetching contacts:', error);
    next(createHttpError(500, 'Failed to fetch contacts'));
  }
};

