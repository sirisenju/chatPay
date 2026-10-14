import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../types/errors.js';

export interface AuthenticatedUser {
  id: string;
  publicKey: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; publicKey: string };
    user: AuthenticatedUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authGuardPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      try {
        const decoded = await request.jwtVerify<{ userId: string; publicKey: string }>();
        if (!decoded || !decoded.userId || !decoded.publicKey) {
          throw new AppError('UNAUTHORIZED', 'Invalid session authentication token', 401);
        }
        request.user = {
          id: decoded.userId,
          publicKey: decoded.publicKey
        };
      } catch (err: unknown) {
        if (err instanceof AppError) {
          throw err;
        }
        throw new AppError('UNAUTHORIZED', 'Missing or invalid authentication token', 401);
      }
    }
  );
};

export const authGuard = fp(authGuardPlugin, {
  name: 'authGuard'
});
