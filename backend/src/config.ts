import { z } from 'zod';

const httpUrl = z
  .string()
  .min(1)
  .refine((v) => /^https?:\/\/[^\s]+$/.test(v), 'must be an absolute http(s) URL');

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Length-only checks are not enough: a committed placeholder can be long
  // enough to pass. Known placeholder shapes are rejected outright so the
  // service refuses to boot on an unreplaced secret.
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine(
      (v) => !/^replace[-_ ]/i.test(v) && !/^(changeme|change-me|placeholder|secret|password)/i.test(v),
      'JWT_SECRET looks like a placeholder — generate one with: openssl rand -hex 32',
    ),
  PUBLIC_ORIGIN: httpUrl,
  BASE_URL: httpUrl.default('http://localhost:8787'),
  OBJECT_STORE: z.enum(['local', 'r2']).default('local'),
  LOCAL_MEDIA_DIR: z.string().min(1).default('./.media'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default('WitnessGrid <noreply@witnessgrid.app>'),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  // Rate caps on the magic-link endpoint: per client IP and per target email,
  // each over a 10-minute fixed window. Higher local values make repeat dev
  // runs (e.g. the Playwright suite) practical without easing prod defaults.
  MAGIC_LINK_IP_LIMIT: z.coerce.number().int().positive().default(10),
  MAGIC_LINK_EMAIL_LIMIT: z.coerce.number().int().positive().default(3),
  PLATFORM: z.enum(['node', 'workers']).default('node'),
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
  const cfg = parsed.data;
  if (cfg.OBJECT_STORE === 'r2') {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const) {
      if (!cfg[key]) throw new Error(`Invalid environment configuration: OBJECT_STORE=r2 requires ${key}`);
    }
  }
  return cfg;
}

const envSource: Record<string, string | undefined> =
  typeof process !== 'undefined' && typeof process.env === 'object'
    ? (process.env as Record<string, string | undefined>)
    : {};

export const config: Config = loadConfig(envSource);

// Misconfiguration that is technically valid but almost certainly accidental.
if (config.RESEND_API_KEY === undefined && config.PLATFORM === 'workers') {
  console.warn(
    '[witnessgrid] RESEND_API_KEY is not set — sign-in links and area alerts will only be logged, not emailed.',
  );
}
