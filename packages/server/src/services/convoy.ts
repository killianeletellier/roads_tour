import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Convoy, Segment, POI, ConvoyMember } from '@prisma/client';
import type { ConvoyRoute, ConvoyDetail, ConvoySummary, ConvoyMemberInfo } from '@roads-tour/shared';

type SegmentWithPoi = Segment & { poi: POI | null };

type ConvoyWithSegments = Convoy & { segments: SegmentWithPoi[] };

export const toConvoySummary = (convoy: Convoy & { _count?: { segments: number }; segments?: unknown[] }): ConvoySummary => ({
  id: convoy.id,
  name: convoy.name,
  accessCode: convoy.accessCode,
  status: convoy.status,
  segmentCount: convoy._count?.segments ?? (convoy.segments?.length ?? 0),
  createdAt: convoy.createdAt.toISOString(),
});

export const toConvoyDetail = (convoy: ConvoyWithSegments): ConvoyDetail => ({
  ...toConvoySummary({ ...convoy, segments: convoy.segments }),
  segments: convoy.segments
    .sort((a, b) => a.order - b.order)
    .map(seg => ({
      id: seg.id,
      order: seg.order,
      name: seg.name,
      geometry: seg.geometry as unknown as GeoJSON.LineString,
      lengthM: seg.lengthM,
      durationMin: seg.durationMin,
      poi: seg.poi
        ? { id: seg.poi.id, lat: seg.poi.lat, lon: seg.poi.lon, label: seg.poi.label }
        : { id: '', lat: 0, lon: 0, label: '' },
    })),
});

export const toConvoyRoute = (convoy: ConvoyWithSegments): ConvoyRoute => {
  const sorted = [...convoy.segments].sort((a, b) => a.order - b.order);
  const points = sorted
    .filter(seg => seg.poi)
    .map((seg, idx) => {
      const name = seg.name?.trim();
      const poiLabel = seg.poi!.label?.trim();
      let label = name || poiLabel || `POI ${idx + 1}`;
      if (/^POI \d+$/.test(label)) {
        label = `POI ${idx + 1}`;
      }
      return {
        id: seg.poi!.id,
        order: idx,
        latitude: seg.poi!.lat,
        longitude: seg.poi!.lon,
        label,
      };
    });

  return {
    id: convoy.id,
    name: convoy.name,
    segments: sorted.map((seg, idx) => {
      const geom = seg.geometry as unknown as GeoJSON.LineString;
      return {
        id: seg.id,
        order: seg.order,
        gpsCoordinates: geom.coordinates.map(([lon, lat]) => ({ lon, lat })),
        lengthM: seg.lengthM,
        estimatedDurationMinutes: seg.durationMin,
        startPointId: seg.poi?.id ?? points[idx]?.id ?? '',
      };
    }),
    points,
  };
};

export const toMemberInfo = (member: ConvoyMember): ConvoyMemberInfo => ({
  id: member.id,
  displayName: member.displayName,
  role: member.role,
  organizerRole: member.organizerRole,
  lat: member.lat,
  lon: member.lon,
  heading: member.heading,
  speed: member.speed,
  isOffRoute: member.isOffRoute,
  lastSeen: member.lastSeen?.toISOString() ?? null,
});

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
    const payload = request.user as { role?: string };
    if (payload.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
};

export const generateAccessCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};
