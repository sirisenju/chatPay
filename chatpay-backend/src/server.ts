import { buildApp } from './app.js';
import { config } from './config/index.js';
import { prisma } from './db/prisma.js';
import { socketGateway } from './realtime/gateway.js';
import { confirmationWatcher } from './modules/payments/watcher.js';

async function start() {
  const app = await buildApp();

  // Initialize Socket.IO Real-time Gateway on the Fastify underlying HTTP server
  socketGateway.initialize(app.server);

  // Start background payment confirmation watcher
  confirmationWatcher.start();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      confirmationWatcher.stop();
      socketGateway.close();
      await app.close();
      await prisma.$disconnect();
      app.log.info('Server, WebSockets, and database connections closed cleanly.');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`🚀 ChatPay Backend running on http://${config.HOST}:${config.PORT}`);
    app.log.info(`📚 OpenAPI Documentation available at http://${config.HOST}:${config.PORT}/docs`);
    app.log.info(`⚡ Socket.IO Real-time Gateway attached to ws://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Only auto-start when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
