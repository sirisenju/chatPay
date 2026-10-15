import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
  jsonSchemaTransform
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { config } from './config/index.js';
import { errorHandler } from './plugins/errorHandler.js';
import { authGuard } from './plugins/authGuard.js';
import { prisma } from './db/prisma.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    trustProxy: true,
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname'
              }
            }
          : undefined,
      redact: ['req.headers.authorization', 'req.body.signature', 'req.body.signedXdr']
    }
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod schema compilers
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Plugins
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: true
  });

  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET
  });

  await app.register(authGuard);

  // Swagger OpenAPI Docs
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'ChatPay Backend API',
        description: 'Chat-based Stellar Testnet payments API specification',
        version: '0.2.0'
      },
      servers: [
        {
          url: '/',
          description: 'Current Environment (Default)'
        },
        {
          url: 'https://chatpay-7anj.onrender.com',
          description: 'Production Render Server'
        },
        {
          url: `http://localhost:${config.PORT}`,
          description: 'Local development server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Provide JWT session token obtained via POST /auth/verify'
          }
        }
      }
    },
    transform: jsonSchemaTransform
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  await app.register(errorHandler);

  // Register Domain Routes
  const { authRoutes } = await import('./modules/auth/routes.js');
  const { walletRoutes } = await import('./modules/wallet/routes.js');
  const { recipientRoutes } = await import('./modules/recipients/routes.js');
  const { commandRoutes } = await import('./modules/commands/routes.js');
  const { paymentRoutes } = await import('./modules/payments/routes.js');
  const { chatRoutes } = await import('./modules/chat/routes.js');

  await app.register(authRoutes);
  await app.register(walletRoutes);
  await app.register(recipientRoutes);
  await app.register(commandRoutes);
  await app.register(paymentRoutes);
  await app.register(chatRoutes);

  // Health endpoint
  app.get(
    '/health',
    {
      schema: {
        description: 'Service and database health check',
        tags: ['System'],
        response: {
          200: z.object({
            status: z.string(),
            timestamp: z.string(),
            version: z.string(),
            database: z.string(),
            stellarHorizon: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      let dbStatus = 'unreachable';
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'healthy';
      } catch {
        dbStatus = 'unreachable';
      }

      return reply.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.2.0',
        database: dbStatus,
        stellarHorizon: config.STELLAR_HORIZON_URL
      });
    }
  );

  return app;
}
