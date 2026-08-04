import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PUBLIC_ORIGIN: z.string().min(1, 'PUBLIC_ORIGIN is required'),
  BASE_URL: z.string().min(1).default('http://localhost:8787'),
  OBJECT_STORE: z.enum(['local', 'r2']).default('local'),
  LOCAL_MEDIA_DIR: z.string().min(1).default('./.media'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_HOST: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default('WitnessGrid <noreply@witnessgrid.app>'),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  PLATFORM: z.enum(['node', 'workers']).optional(),
  PORT: z.coerce.number().int().positive().default(8787),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(source: Record<string, string | undefined> = {}): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  return parsed.data;
}

const envSource: Record<string, string | undefined> =
  typeof process !== 'undefined' && typeof process.env === 'object'
    ? (process.env as Record<string, string | undefined>)
    : {};

export const config: Config = loadConfig(envSource);