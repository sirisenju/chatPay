import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authService } from './service.js';
import { config } from '../../config/index.js';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /auth/challenge
  server.post(
    '/auth/challenge',
    {
      schema: {
        description: 'Request a single-use expiring authentication challenge for a Stellar public key',
        tags: ['Authentication'],
        body: z.object({
          publicKey: z.string().min(56).max(56).describe('Stellar ed25519 public key (G...)')
        }),
        response: {
          200: z.object({
            challenge: z.string(),
            nonce: z.string(),
            expiresAt: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      const { publicKey } = request.body;
      const result = await authService.createChallenge(publicKey);
      return reply.status(200).send({
        challenge: result.challenge,
        nonce: result.nonce,
        expiresAt: result.expiresAt.toISOString()
      });
    }
  );

  // POST /auth/verify
  server.post(
    '/auth/verify',
    {
      schema: {
        description: 'Submit wallet signature for authentication challenge and obtain JWT bearer session token',
        tags: ['Authentication'],
        body: z.object({
          publicKey: z.string().min(56).max(56),
          signature: z.string().min(1),
          nonce: z.string().optional()
        }),
        response: {
          200: z.object({
            token: z.string(),
            user: z.object({
              id: z.string(),
              publicKey: z.string()
            })
          })
        }
      }
    },
    async (request, reply) => {
      const { publicKey, signature, nonce } = request.body;
      const { user } = await authService.verifyChallenge(publicKey, signature, nonce);

      const token = fastify.jwt.sign(
        {
          userId: user.id,
          publicKey: user.publicKey
        },
        {
          expiresIn: config.JWT_EXPIRES_IN
        }
      );

      return reply.status(200).send({
        token,
        user
      });
    }
  );
};
