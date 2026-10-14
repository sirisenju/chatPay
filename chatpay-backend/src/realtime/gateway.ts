import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config/index.js';
import { prisma } from '../db/prisma.js';
import { commandService } from '../modules/commands/service.js';
import { paymentService } from '../modules/payments/service.js';

interface SocketUser {
  id: string;
  publicKey: string;
}

const commandSendSchema = z.object({
  text: z.string().min(1),
  clientMsgId: z.string().optional()
});

const paymentSubmitSchema = z.object({
  paymentId: z.string().uuid(),
  signedXdr: z.string().min(1)
});

const syncRequestSchema = z.object({
  lastSeq: z.number().int().min(0).default(0)
});

export class SocketGateway {
  private io: SocketIOServer | null = null;

  initialize(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
        methods: ['GET', 'POST']
      }
    });

    // Handshake Authentication Middleware
    this.io.use((socket: Socket, next) => {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string; publicKey: string };
        if (!decoded.userId || !decoded.publicKey) {
          return next(new Error('Invalid token payload'));
        }
        socket.data.user = {
          id: decoded.userId,
          publicKey: decoded.publicKey
        } as SocketUser;
        next();
      } catch {
        return next(new Error('Invalid or expired authentication token'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const user = socket.data.user as SocketUser;
      const userRoom = `user:${user.id}`;
      socket.join(userRoom);

      // Event: command:send
      socket.on('command:send', async (rawData: unknown, callback?: (res: unknown) => void) => {
        try {
          const validated = commandSendSchema.parse(rawData);
          const result = await commandService.processCommand({
            userId: user.id,
            userPublicKey: user.publicKey,
            text: validated.text,
            clientMsgId: validated.clientMsgId
          });

          if (result.type === 'preview' && result.preview) {
            this.emitToUser(user.id, 'payment:preview', result.preview);
            this.emitToUser(user.id, 'message:new', {
              role: 'system',
              type: 'preview',
              payload: result.preview
            });
          } else {
            this.emitToUser(user.id, 'message:new', {
              role: 'system',
              type: result.type,
              payload: {
                message: result.message,
                options: result.options,
                code: result.code,
                alias: result.alias
              }
            });
          }

          if (callback) callback({ success: true, result });
        } catch (err: unknown) {
          const errorMsg = (err as Error).message || 'Failed to process command';
          this.emitToUser(user.id, 'message:new', {
            role: 'system',
            type: 'error',
            payload: { message: errorMsg }
          });
          if (callback) callback({ success: false, error: errorMsg });
        }
      });

      // Event: payment:submit
      socket.on('payment:submit', async (rawData: unknown, callback?: (res: unknown) => void) => {
        try {
          const validated = paymentSubmitSchema.parse(rawData);
          const result = await paymentService.submitPayment(
            user.id,
            user.publicKey,
            validated.paymentId,
            validated.signedXdr
          );

          this.emitToUser(user.id, 'payment:status', result);
          if (callback) callback({ success: true, result });
        } catch (err: unknown) {
          const errorMsg = (err as Error).message || 'Failed to submit payment';
          this.emitToUser(user.id, 'payment:status', {
            status: 'failed',
            error: errorMsg
          });
          if (callback) callback({ success: false, error: errorMsg });
        }
      });

      // Event: sync:request
      socket.on('sync:request', async (rawData: unknown, callback?: (res: unknown) => void) => {
        try {
          const validated = syncRequestSchema.parse(rawData || {});
          const messages = await prisma.chatMessage.findMany({
            where: {
              userId: user.id,
              seq: { gt: validated.lastSeq }
            },
            orderBy: { seq: 'asc' }
          });

          if (callback) {
            callback({ success: true, messages });
          } else {
            socket.emit('sync:response', { messages });
          }
        } catch (err: unknown) {
          if (callback) callback({ success: false, error: (err as Error).message });
        }
      });
    });
  }

  /**
   * Pushes real-time events exclusively to a specific authenticated user's room.
   */
  emitToUser(userId: string, event: string, payload: unknown) {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, payload);
  }

  close() {
    if (this.io) {
      this.io.close();
      this.io = null;
    }
  }
}

export const socketGateway = new SocketGateway();
