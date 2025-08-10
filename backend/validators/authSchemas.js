// backend/validators/authSchemas.js
import { z } from 'zod';

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(6).max(128, 'Password too long');

export const registerSchema = z
  .object({
    // Accept either fullName or name; we’ll normalize in controller
    fullName: z.string().trim().min(1, 'Full name is required').optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(6, 'Phone is required'),
    email,
    password,
  })
  .superRefine((data, ctx) => {
    if (!data.fullName && !data.name) {
      ctx.addIssue({
        path: ['fullName'],
        code: z.ZodIssueCode.custom,
        message: 'Either fullName or name is required',
      });
    }
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password,
});

export const resendVerificationSchema = z.object({
  email: email.optional(),
});

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(10),
});
