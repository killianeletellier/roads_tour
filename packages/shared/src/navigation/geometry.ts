const toRad = (deg: number): number => (deg * Math.PI) / 180;

export const haversineDistance = (
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
): number => {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const nearestPointOnSegment = (
  p: [number, number],
  a: [number, number],
  b: [number, number],
): { distance: number; nearest: [number, number] } => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq))
    : 0;
  const nearest: [number, number] = [a[0] + t * dx, a[1] + t * dy];
  return { distance: haversineDistance(p, nearest), nearest };
};

export const nearestPointOnPolyline = (
  point: [number, number],
  polyline: [number, number][],
): { distance: number; nearest: [number, number] } => {
  let minDist = Infinity;
  let nearest: [number, number] = polyline[0];

  for (let i = 0; i < polyline.length - 1; i++) {
    const result = nearestPointOnSegment(point, polyline[i], polyline[i + 1]);
    if (result.distance < minDist) {
      minDist = result.distance;
      nearest = result.nearest;
    }
  }

  return { distance: minDist, nearest };
};

export const polylineLengthM = (coords: [number, number][]): number => {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i], coords[i + 1]);
  }
  return total;
};

export const estimateDurationMin = (lengthM: number, speedKmh = 50): number =>
  (lengthM / 1000 / speedKmh) * 60;
