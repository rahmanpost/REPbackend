// backend/validators/userSchemas.js
import { z } from 'zod';
import { objectId, email, roleEnum, optionalString } from './common.js';

export const userIdParams = z.object({ id: objectId });

export const createUserBody = z.object({
  name: z.string().trim().min(1),
  email,
  password: z.string().min(6).max(128),
  role: roleEnum, // ADMIN | AGENT | CUSTOMER
});

export const updateUserBody = z.object({
  name: z.string().trim().min(1).optional(),
  email: email.optional(),
  password: z.string().min(6).max(128).optional(),
  role: roleEnum.optional(),
  note: optionalString,
});
