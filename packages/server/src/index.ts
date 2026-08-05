import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { registerAdminRoutes, registerPublicRoutes, registerOsrmProxy } from './routes/index.js';
import { setupSocketIO } from './socket/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { role: string };
    user: { role: string };
  }
}

const buildApp = async () => {
  const app = Fastify({
    logger: config.nodeEnv !== 'production',
    trustProxy: config.nodeEnv === 'production',
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret, cookie: { cookieName: 'admin_token', signed: false } });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  await registerAdminRoutes(app);
  await registerPublicRoutes(app);
  await registerOsrmProxy(app);

  app.get('/api/health', async () => ({ status: 'ok' }));

  if (config.nodeEnv === 'production') {
    const clientPath = path.resolve(__dirname, config.clientDist);
    await app.register(fastifyStatic, {
      root: clientPath,
      prefix: '/',
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/socket.io')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
};

const start = async () => {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  setupSocketIO(app.server);
  console.log(`Server listening on ${config.host}:${config.port}`);
};

start().catch(err => {
  console.error(err);
  process.exit(1);
});
