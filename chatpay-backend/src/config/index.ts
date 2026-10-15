import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env.local first if present, then fall back to .env
dotenv.config({ path: '.env.local' });
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('chatpay-backend'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z
    .string()
    .default(
      process.env.DATABASE_URL ||
        (process.env.USER
          ? `postgresql://${process.env.USER}@localhost:5432/chatpay_db`
          : 'postgresql://postgres:postgrespassword@localhost:5432/chatpay_db')
    ),

  JWT_SECRET: z.string().min(16).default('chatpay_development_jwt_secret_key_minimum_32_chars!'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),

  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  USDC_ASSET_CODE: z.string().default('USDC'),
  USDC_ISSUER: z.string().default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  TEST_ISSUER_PUBLIC_KEY: z.string().optional(),

  MAX_PAYMENT_CAP: z.string().default('1000'),
  TRANSACTION_TIMEOUT_SECONDS: z.coerce.number().default(300),

  ENABLE_LLM_PARSER: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  OPENAI_API_KEY: z.string().optional()
});

const parseConfig = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid application configuration:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
};

export const config = parseConfig();
export type Config = z.infer<typeof envSchema>;
