import { XMLParser } from 'fast-xml-parser';
import { polylineLengthM, estimateDurationMin } from '../navigation/geometry.js';
import type { Segment, POI } from '../types.js';

export interface ParsedGpxSegment {
  order: number;
  name: string;
  geometry: GeoJSON.LineString;
  lengthM: number;
  durationMin: number;
  poi: Omit<POI, 'id'>;
}

interface GpxPoint {
  '@_lat': string;
  '@_lon': string;
  name?: string;
}

interface GpxTrkseg {
  trkpt?: GpxPoint | GpxPoint[];
}

interface GpxTrk {
  trkseg?: GpxTrkseg | GpxTrkseg[];
  name?: string;
}

interface GpxRte {
  rtept?: GpxPoint | GpxPoint[];
  name?: string;
}

interface GpxRoot {
  gpx?: {
    trk?: GpxTrk | GpxTrk[];
    rte?: GpxRte | GpxRte[];
  };
}

const asArray = <T>(val: T | T[] | undefined): T[] => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

const parsePoints = (pts: GpxPoint | GpxPoint[] | undefined): Array<{ lat: number; lon: number; name?: string }> => {
  return asArray(pts).map(pt => ({
    lat: parseFloat(pt['@_lat']),
    lon: parseFloat(pt['@_lon']),
    name: pt.name,
  }));
};

export const parseGpxSegments = (gpxContent: string): ParsedGpxSegment[] => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const parsed = parser.parse(gpxContent) as GpxRoot;
  const segments: ParsedGpxSegment[] = [];
  let order = 0;

  const tracks = asArray(parsed.gpx?.trk);
  for (const trk of tracks) {
    const trksegs = asArray(trk.trkseg);
    for (const seg of trksegs) {
      const points = parsePoints(seg.trkpt);
      if (points.length < 2) continue;
      const coords = points.map(p => [p.lon, p.lat] as [number, number]);
      const last = points[points.length - 1];
      const lengthM = polylineLengthM(coords);
      const segIndex = order + 1;
      const poiLabel = last.name ?? `POI ${segIndex}`;
      segments.push({
        order: order++,
        name: trk.name ?? poiLabel,
        geometry: { type: 'LineString', coordinates: coords },
        lengthM,
        durationMin: estimateDurationMin(lengthM),
        poi: {
          lat: last.lat,
          lon: last.lon,
          label: poiLabel,
        },
      });
    }
  }

  const routes = asArray(parsed.gpx?.rte);
  for (const rte of routes) {
    const points = parsePoints(rte.rtept);
    if (points.length < 2) continue;
    const coords = points.map(p => [p.lon, p.lat] as [number, number]);
    const last = points[points.length - 1];
    const lengthM = polylineLengthM(coords);
    const segIndex = order + 1;
    const poiLabel = last.name ?? rte.name ?? `POI ${segIndex}`;
    segments.push({
      order: order++,
      name: rte.name ?? poiLabel,
      geometry: { type: 'LineString', coordinates: coords },
      lengthM,
      durationMin: estimateDurationMin(lengthM),
      poi: {
        lat: last.lat,
        lon: last.lon,
        label: poiLabel,
      },
    });
  }

  return segments;
};
