import { z } from 'zod';

export const errorCodes = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VALIDATION: 'validation_error',
  RATE_LIMITED: 'rate_limited',
  CONFLICT: 'conflict',
  STORAGE: 'storage_error',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorPayload = z.infer<typeof ApiErrorSchema>;
