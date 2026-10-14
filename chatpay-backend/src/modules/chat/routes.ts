import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';

export const chatRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/chat/messages',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Replay or list chat messages since an optional sequence cursor',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          since: z.coerce.number().int().min(0).default(0).describe('Sequence cursor to fetch messages after'),
          limit: z.coerce.number().int().min(1).max(100).default(50)
        }),
        response: {
          200: z.object({
            messages: z.array(
              z.object({
                id: z.string(),
                seq: z.number(),
                role: z.enum(['user', 'system']),
                type: z.string(),
                payload: z.unknown(),
                clientMsgId: z.string().nullable().optional(),
                createdAt: z.date().or(z.string())
              })
            )
          })
        }
      }
    },
    async (request, reply) => {
      const { since, limit } = request.query;
      const messages = await prisma.chatMessage.findMany({
        where: {
          userId: request.user.id,
          seq: { gt: since }
        },
        orderBy: { seq: 'asc' },
        take: limit
      });

      return reply.status(200).send({ messages });
    }
  );
};
