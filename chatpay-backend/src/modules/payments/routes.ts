import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { paymentService } from './service.js';

export const paymentRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  server.addHook('preHandler', fastify.authenticate);

  // POST /payments/:id/submit
  server.post(
    '/payments/:id/submit',
    {
      schema: {
        description: 'Submit a signed Stellar transaction XDR for a payment preview',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid()
        }),
        body: z.object({
          signedXdr: z.string().min(1).describe('Base64-encoded signed Stellar transaction envelope XDR')
        }),
        response: {
          200: z.object({
            paymentId: z.string(),
            status: z.string(),
            txHash: z.string(),
            explorerUrl: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params;
      const { signedXdr } = request.body;
      const result = await paymentService.submitPayment(
        request.user.id,
        request.user.publicKey,
        id,
        signedXdr
      );
      return reply.status(200).send(result);
    }
  );

  // GET /payments/:id
  server.get(
    '/payments/:id',
    {
      schema: {
        description: 'Get status and details of a payment by ID',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid()
        }),
        response: {
          200: z.object({
            id: z.string(),
            recipientAlias: z.string(),
            recipientAddress: z.string(),
            amount: z.string(),
            assetCode: z.string(),
            memo: z.string().nullable().optional(),
            status: z.string(),
            txHash: z.string().nullable().optional(),
            explorerUrl: z.string().nullable().optional(),
            createdAt: z.date().or(z.string()),
            confirmedAt: z.date().or(z.string()).nullable().optional(),
            expiresAt: z.date().or(z.string()),
            failureCode: z.string().nullable().optional()
          })
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params;
      const payment = await paymentService.getPayment(request.user.id, id);
      return reply.status(200).send(payment);
    }
  );

  // GET /payments
  server.get(
    '/payments',
    {
      schema: {
        description: "List paginated payment history for the user's connected wallet",
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0)
        }),
        response: {
          200: z.object({
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
            items: z.array(
              z.object({
                id: z.string(),
                recipientAlias: z.string(),
                recipientAddress: z.string(),
                amount: z.string(),
                assetCode: z.string(),
                memo: z.string().nullable().optional(),
                status: z.string(),
                txHash: z.string().nullable().optional(),
                explorerUrl: z.string().nullable().optional(),
                createdAt: z.date().or(z.string()),
                confirmedAt: z.date().or(z.string()).nullable().optional(),
                failureCode: z.string().nullable().optional()
              })
            )
          })
        }
      }
    },
    async (request, reply) => {
      const { limit, offset } = request.query;
      const history = await paymentService.listPayments(request.user.id, { limit, offset });
      return reply.status(200).send(history);
    }
  );
};
