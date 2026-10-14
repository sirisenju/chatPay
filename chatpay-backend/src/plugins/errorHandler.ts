import { FastifyError, FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError, ApiErrorResponse } from '../types/errors.js';

const errorHandlerPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.setErrorHandler((error: FastifyError | AppError | ZodError | Error, request, reply) => {
    // 1. Domain AppError
    if (error instanceof AppError) {
      const response: ApiErrorResponse = {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {})
      };
      return reply.status(error.statusCode).send(response);
    }

    // 2. Zod Validation Error
    if (error instanceof ZodError) {
      const response: ApiErrorResponse = {
        code: 'VALIDATION_FAILED',
        message: 'Invalid request data',
        details: error.flatten()
      };
      return reply.status(400).send(response);
    }

    // 3. Fastify Schema Validation Error
    if ('validation' in error && error.validation) {
      const response: ApiErrorResponse = {
        code: 'VALIDATION_FAILED',
        message: error.message,
        details: error.validation
      };
      return reply.status(400).send(response);
    }

    // 4. Fastify HTTP Errors (e.g. 404, 401)
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      const code = error.statusCode === 401 ? 'UNAUTHORIZED' : error.statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
      const response: ApiErrorResponse = {
        code,
        message: error.message
      };
      return reply.status(error.statusCode).send(response);
    }

    // 5. Unhandled Internal Server Errors
    request.log.error(error, 'Unhandled Server Exception');
    const response: ApiErrorResponse = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred'
    };
    return reply.status(500).send(response);
  });
};

export const errorHandler = fp(errorHandlerPlugin, {
  name: 'errorHandler'
});
