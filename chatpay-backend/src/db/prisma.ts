import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

declare global {
  // eslint-disable-next-line no-var
  var __chatpay_prisma: PrismaClient | undefined;
}

export const prisma =
  global.__chatpay_prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: config.DATABASE_URL
      }
    },
    log: config.LOG_LEVEL === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error']
  });

if (config.NODE_ENV !== 'production') {
  global.__chatpay_prisma = prisma;
}
