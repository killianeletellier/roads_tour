import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const monorepoRootEnv = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.env',
);

dotenv.config({ path: monorepoRootEnv });

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://roadstour:roadstour@localhost:5433/roadstour',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  osrmUrl: process.env.OSRM_URL ?? 'http://localhost:5000',
  clientDist: process.env.CLIENT_DIST ?? '../../client/dist',
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
