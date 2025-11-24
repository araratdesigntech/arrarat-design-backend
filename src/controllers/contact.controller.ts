import { NextFunction, Response, Request } from 'express';

import { AuthenticatedRequestBody, ContactT, IUser } from '@src/interfaces';
import { createContactService, getAllContactsService } from '@src/services';

export const createContactController = (
  req: Request<{}, {}, ContactT>,
  res: Response,
  next: NextFunction
) => createContactService(req, res, next);

export const getAllContactsController = (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => getAllContactsService(req, res, next);

export default createContactController;

