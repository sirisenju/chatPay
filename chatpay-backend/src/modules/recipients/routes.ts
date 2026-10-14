import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { recipientService } from './service.js';

const RecipientResponseSchema = z.object({
  id: z.string(),
  alias: z.string(),
  address: z.string(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  warnings: z.array(z.string()).optional()
});

export const recipientRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // All recipient routes require authentication
  server.addHook('preHandler', fastify.authenticate);

  // GET /recipients
  server.get(
    '/recipients',
    {
      schema: {
        description: "List all recipients in the authenticated user's address book",
        tags: ['Recipients'],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.array(RecipientResponseSchema)
        }
      }
    },
    async (request, reply) => {
      const recipients = await recipientService.listRecipients(request.user.id);
      return reply.status(200).send(recipients);
    }
  );

  // POST /recipients
  server.post(
    '/recipients',
    {
      schema: {
        description: 'Add a new recipient alias and Stellar address to your address book',
        tags: ['Recipients'],
        security: [{ bearerAuth: [] }],
        body: z.object({
          alias: z.string().min(1).max(50).describe('User-friendly alias (e.g. Alex)'),
          address: z.string().min(56).max(56).describe('Stellar ed25519 public key (G...)')
        }),
        response: {
          201: RecipientResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { alias, address } = request.body;
      const created = await recipientService.createRecipient(
        request.user.id,
        request.user.publicKey,
        alias,
        address
      );
      return reply.status(201).send(created);
    }
  );

  // PATCH /recipients/:id
  server.patch(
    '/recipients/:id',
    {
      schema: {
        description: 'Edit a recipient alias or address',
        tags: ['Recipients'],
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid()
        }),
        body: z.object({
          alias: z.string().min(1).max(50).optional(),
          address: z.string().min(56).max(56).optional()
        }),
        response: {
          200: RecipientResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params;
      const updated = await recipientService.updateRecipient(
        request.user.id,
        request.user.publicKey,
        id,
        request.body
      );
      return reply.status(200).send(updated);
    }
  );

  // DELETE /recipients/:id
  server.delete(
    '/recipients/:id',
    {
      schema: {
        description: 'Delete a recipient from your address book',
        tags: ['Recipients'],
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid()
        }),
        response: {
          204: z.null()
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params;
      await recipientService.deleteRecipient(request.user.id, id);
      return reply.status(204).send(null);
    }
  );
};
