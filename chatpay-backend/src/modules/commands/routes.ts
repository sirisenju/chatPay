import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { commandService } from './service.js';

export const commandRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  server.post(
    '/commands',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Process natural-language payment command text and return transaction preview or clarification',
        tags: ['Commands'],
        security: [{ bearerAuth: [] }],
        body: z.object({
          text: z.string().min(1).describe("Natural language payment instruction (e.g. 'Send 10 USDC to Alex')"),
          clientMsgId: z.string().optional().describe('Unique client message ID for idempotency')
        }),
        response: {
          200: z.object({
            type: z.enum(['preview', 'clarify', 'needs_recipient', 'error']),
            message: z.string(),
            code: z.string().optional(),
            alias: z.string().optional(),
            options: z.array(z.string()).optional(),
            preview: z
              .object({
                paymentId: z.string(),
                recipientAlias: z.string(),
                recipientAddress: z.string(),
                amount: z.string(),
                asset: z.string(),
                estimatedFee: z.string(),
                memo: z.string().optional(),
                expiresAt: z.string(),
                unsignedXdr: z.string(),
                warnings: z.array(z.string())
              })
              .optional()
          })
        }
      }
    },
    async (request, reply) => {
      const { text, clientMsgId } = request.body;
      const result = await commandService.processCommand({
        userId: request.user.id,
        userPublicKey: request.user.publicKey,
        text,
        clientMsgId
      });

      return reply.status(200).send(result);
    }
  );
};
