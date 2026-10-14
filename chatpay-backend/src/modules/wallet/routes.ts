import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { stellarClient } from '../../stellar/client.js';

export const walletRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  server.get(
    '/me/wallet',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get connected account XLM and USDC balances and trustline status',
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            publicKey: z.string(),
            exists: z.boolean(),
            nativeBalance: z.string(),
            usdcBalance: z.string(),
            hasUsdcTrustline: z.boolean()
          })
        }
      }
    },
    async (request, reply) => {
      const { publicKey } = request.user;
      const balanceInfo = await stellarClient.getAccountBalances(publicKey);

      return reply.status(200).send({
        publicKey,
        exists: balanceInfo.exists,
        nativeBalance: balanceInfo.nativeBalance,
        usdcBalance: balanceInfo.usdcBalance,
        hasUsdcTrustline: balanceInfo.hasUsdcTrustline
      });
    }
  );
};
