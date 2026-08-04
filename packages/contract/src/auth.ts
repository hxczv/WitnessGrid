import { z } from 'zod';

export const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/)
    .optional(),
});
export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>;

export const VerifyTokenSchema = z.object({
  token: z.string().min(20),
});
export type VerifyTokenPayload = z.infer<typeof VerifyTokenSchema>;

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const SessionSchema = z.object({
  token: z.string().min(1),
  user: SessionUserSchema,
});
export type Session = z.infer<typeof SessionSchema>;
