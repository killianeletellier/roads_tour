import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const bcrypt = () => import('bcrypt');
import { parseGpxSegments } from '@roads-tour/shared';
import { prisma } from '../db.js';
import { config } from '../config.js';
import {
  toConvoyDetail,
  toConvoySummary,
  toConvoyRoute,
  requireAdmin,
  generateAccessCode,
} from '../services/convoy.js';

const createConvoySchema = z.object({
  name: z.string().min(1),
  accessCode: z.string().min(6).max(8).optional(),
  adminPassword: z.string().min(4),
  status: z.enum(['draft', 'ready', 'active', 'archived']).optional(),
});

const updateConvoySchema = z.object({
  name: z.string().min(1).optional(),
  accessCode: z.string().min(6).max(8).optional(),
  adminPassword: z.string().min(4).optional(),
  status: z.enum(['draft', 'ready', 'active', 'archived']).optional(),
});

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post('/api/admin/login', async (request, reply) => {
    const body = z.object({ password: z.string() }).parse(request.body);
    if (body.password !== config.adminPassword) {
      return reply.status(401).send({ error: 'Invalid password' });
    }
    const token = app.jwt.sign({ role: 'admin' }, { expiresIn: '24h' });
    reply.setCookie('admin_token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });
    return { ok: true, token };
  });

  app.post('/api/admin/logout', async (_request, reply) => {
    reply.clearCookie('admin_token', { path: '/' });
    return { ok: true };
  });

  app.get('/api/admin/me', { preHandler: requireAdmin }, async () => ({ ok: true }));

  app.get('/api/admin/convoys', { preHandler: requireAdmin }, async () => {
    const convoys = await prisma.convoy.findMany({
      include: { _count: { select: { segments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return convoys.map(toConvoySummary);
  });

  app.post('/api/admin/convoys', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createConvoySchema.parse(request.body);
    const accessCode = body.accessCode?.toUpperCase() ?? generateAccessCode();
    const hash = await (await bcrypt()).hash(body.adminPassword, 10);
    try {
      const convoy = await prisma.convoy.create({
        data: {
          name: body.name,
          accessCode,
          adminPasswordHash: hash,
          status: body.status ?? 'draft',
        },
        include: { segments: { include: { poi: true } } },
      });
      return toConvoyDetail(convoy);
    } catch {
      return reply.status(409).send({ error: 'Access code already exists' });
    }
  });

  app.get('/api/admin/convoys/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const convoy = await prisma.convoy.findUnique({
      where: { id },
      include: { segments: { include: { poi: true } } },
    });
    if (!convoy) return reply.status(404).send({ error: 'Not found' });
    return toConvoyDetail(convoy);
  });

  app.patch('/api/admin/convoys/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateConvoySchema.parse(request.body);
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.accessCode) data.accessCode = body.accessCode.toUpperCase();
    if (body.status) data.status = body.status;
    if (body.adminPassword) data.adminPasswordHash = await (await bcrypt()).hash(body.adminPassword, 10);
    try {
      const convoy = await prisma.convoy.update({
        where: { id },
        data,
        include: { segments: { include: { poi: true } } },
      });
      return toConvoyDetail(convoy);
    } catch {
      return reply.status(404).send({ error: 'Not found' });
    }
  });

  app.delete('/api/admin/convoys/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.convoy.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.status(404).send({ error: 'Not found' });
    }
  });

  app.post('/api/admin/convoys/:id/gpx', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mode } = request.query as { mode?: 'replace' | 'append' };
    const convoy = await prisma.convoy.findUnique({
      where: { id },
      include: { segments: true },
    });
    if (!convoy) return reply.status(404).send({ error: 'Not found' });

    const files: Array<{ buffer: Buffer; filename: string }> = [];
    for await (const part of request.files()) {
      if (part.type === 'file') {
        files.push({ buffer: await part.toBuffer(), filename: part.filename });
      }
    }
    if (!files.length) return reply.status(400).send({ error: 'No file uploaded' });

    const allParsed = files.flatMap(f => parseGpxSegments(f.buffer.toString('utf-8')));
    if (!allParsed.length) return reply.status(400).send({ error: 'No segments found in GPX' });

    const shouldAppend = mode === 'append' || (mode !== 'replace' && files.length > 1 && convoy.segments.length > 0);
    if (!shouldAppend) {
      await prisma.segment.deleteMany({ where: { convoyId: id } });
    }

    const startOrder = shouldAppend
      ? (convoy.segments.reduce((max, s) => Math.max(max, s.order), -1) + 1)
      : 0;

    for (let i = 0; i < allParsed.length; i++) {
      const seg = allParsed[i];
      await prisma.segment.create({
        data: {
          convoyId: id,
          order: startOrder + i,
          name: seg.name,
          geometry: seg.geometry as object,
          lengthM: seg.lengthM,
          durationMin: seg.durationMin,
          poi: {
            create: {
              lat: seg.poi.lat,
              lon: seg.poi.lon,
              label: seg.poi.label,
            },
          },
        },
      });
    }

    const updated = await prisma.convoy.findUnique({
      where: { id },
      include: { segments: { include: { poi: true } } },
    });
    return toConvoyDetail(updated!);
  });

  app.patch('/api/admin/convoys/:convoyId/segments/:segmentId', { preHandler: requireAdmin }, async (request, reply) => {
    const { convoyId, segmentId } = request.params as { convoyId: string; segmentId: string };
    const body = z.object({
      name: z.string().max(128).optional(),
      order: z.number().int().min(0).optional(),
    }).parse(request.body);

    const segment = await prisma.segment.findFirst({ where: { id: segmentId, convoyId } });
    if (!segment) return reply.status(404).send({ error: 'Segment not found' });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.order !== undefined) data.order = body.order;

    await prisma.segment.update({ where: { id: segmentId }, data });

    const updated = await prisma.convoy.findUnique({
      where: { id: convoyId },
      include: { segments: { include: { poi: true } } },
    });
    return toConvoyDetail(updated!);
  });

  app.put('/api/admin/convoys/:convoyId/segments/reorder', { preHandler: requireAdmin }, async (request, reply) => {
    const { convoyId } = request.params as { convoyId: string };
    const body = z.object({ segmentIds: z.array(z.string().uuid()).min(1) }).parse(request.body);

    const segments = await prisma.segment.findMany({ where: { convoyId } });
    if (segments.length !== body.segmentIds.length) {
      return reply.status(400).send({ error: 'Segment list mismatch' });
    }
    const idSet = new Set(segments.map(s => s.id));
    if (!body.segmentIds.every(id => idSet.has(id))) {
      return reply.status(400).send({ error: 'Invalid segment id' });
    }

    await prisma.$transaction(
      body.segmentIds.map((segmentId, order) =>
        prisma.segment.update({ where: { id: segmentId }, data: { order } }),
      ),
    );

    const updated = await prisma.convoy.findUnique({
      where: { id: convoyId },
      include: { segments: { include: { poi: true } } },
    });
    return toConvoyDetail(updated!);
  });

  app.delete('/api/admin/convoys/:convoyId/segments/:segmentId', { preHandler: requireAdmin }, async (request, reply) => {
    const { convoyId, segmentId } = request.params as { convoyId: string; segmentId: string };

    const segment = await prisma.segment.findFirst({ where: { id: segmentId, convoyId } });
    if (!segment) return reply.status(404).send({ error: 'Segment not found' });

    await prisma.segment.delete({ where: { id: segmentId } });

    const remaining = await prisma.segment.findMany({
      where: { convoyId },
      orderBy: { order: 'asc' },
    });
    await prisma.$transaction(
      remaining.map((seg, order) =>
        prisma.segment.update({ where: { id: seg.id }, data: { order } }),
      ),
    );

    const updated = await prisma.convoy.findUnique({
      where: { id: convoyId },
      include: { segments: { include: { poi: true } } },
    });
    return toConvoyDetail(updated!);
  });
}

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get('/api/convoys/by-code/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const convoy = await prisma.convoy.findUnique({
      where: { accessCode: code.toUpperCase() },
      include: { segments: { include: { poi: true } } },
    });
    if (!convoy) return reply.status(404).send({ error: 'Convoy not found' });
    if (convoy.status === 'archived' || convoy.status === 'draft') {
      return reply.status(403).send({ error: 'Convoy not available' });
    }
    return {
      id: convoy.id,
      name: convoy.name,
      accessCode: convoy.accessCode,
      status: convoy.status,
      segmentCount: convoy.segments.length,
    };
  });

  app.get('/api/convoys/:id/route', async (request, reply) => {
    const { id } = request.params as { id: string };
    const convoy = await prisma.convoy.findUnique({
      where: { id },
      include: { segments: { include: { poi: true } } },
    });
    if (!convoy) return reply.status(404).send({ error: 'Not found' });
    return toConvoyRoute(convoy);
  });

  app.post('/api/convoys/:id/join', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      displayName: z.string().min(1).max(32),
      role: z.enum(['participant', 'organizer']).default('participant'),
      adminPassword: z.string().optional(),
      organizerRole: z.enum(['lead', 'sweep', 'door']).optional(),
    }).parse(request.body);

    const convoy = await prisma.convoy.findUnique({ where: { id } });
    if (!convoy) return reply.status(404).send({ error: 'Not found' });

    if (body.role === 'organizer') {
      if (!body.adminPassword) return reply.status(401).send({ error: 'Password required' });
      const valid = await (await bcrypt()).compare(body.adminPassword, convoy.adminPasswordHash);
      if (!valid) return reply.status(401).send({ error: 'Invalid password' });
    }

    try {
      const member = await prisma.convoyMember.create({
        data: {
          convoyId: id,
          displayName: body.displayName,
          role: body.role,
          organizerRole: body.role === 'organizer' ? (body.organizerRole ?? 'lead') : null,
        },
      });

      const fullConvoy = await prisma.convoy.findUnique({
        where: { id },
        include: { segments: { include: { poi: true } } },
      });

      return {
        memberId: member.id,
        token: member.sessionToken,
        convoy: toConvoyRoute(fullConvoy!),
        role: member.role,
        organizerRole: member.organizerRole,
      };
    } catch {
      return reply.status(409).send({ error: 'Display name already taken' });
    }
  });

  app.get('/api/config', async () => ({
    osrmUrl: config.osrmUrl.startsWith('http') ? '/api/osrm' : config.osrmUrl,
  }));
}

const OSRM_PROXY_TIMEOUT_MS = 30_000;

export async function registerOsrmProxy(app: FastifyInstance) {
  app.get('/api/health/osrm', async (_request, reply) => {
    const probeUrl = `${config.osrmUrl.replace(/\/$/, '')}/nearest/v1/driving/0,0`;
    try {
      const res = await fetch(probeUrl, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) {
        return reply.status(503).send({
          status: 'degraded',
          message: `OSRM responded with HTTP ${res.status}`,
        });
      }
      return { status: 'ok' };
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      return reply.status(503).send({
        status: 'unavailable',
        message: 'OSRM unreachable from app container',
        ...(config.nodeEnv !== 'production' ? { detail: cause } : {}),
      });
    }
  });

  app.all('/api/osrm/*', async (request, reply) => {
    const path = (request.params as { '*': string })['*'] ?? '';
    const queryIndex = request.url.indexOf('?');
    const query = queryIndex >= 0 ? request.url.slice(queryIndex) : '';
    const upstream = `${config.osrmUrl.replace(/\/$/, '')}/${path}${query}`;

    try {
      const res = await fetch(upstream, {
        method: request.method,
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(OSRM_PROXY_TIMEOUT_MS),
      });
      const body = await res.text();

      if (!res.ok) {
        request.log.warn(
          { upstream, status: res.status, body: body.slice(0, 512) },
          'OSRM upstream HTTP error',
        );
      }

      const contentType = res.headers.get('content-type') ?? 'application/json';
      return reply.status(res.status).header('content-type', contentType).send(body || '{}');
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      request.log.error({ upstream, cause, osrmUrl: config.osrmUrl, err }, 'OSRM proxy unreachable');
      return reply.status(502).type('application/json').send({
        error: 'OSRM unavailable',
        code: 'OsrmUnreachable',
        message:
          'Le serveur de routage OSRM est inaccessible. Vérifiez que le conteneur osrm tourne et que les fichiers region.osrm sont présents dans le volume osrm-data.',
        ...(config.nodeEnv !== 'production' ? { detail: cause } : {}),
      });
    }
  });
}
