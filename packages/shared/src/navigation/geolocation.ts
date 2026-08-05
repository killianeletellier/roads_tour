import type { FeatureCollection, LineString } from 'geojson';

export interface NavStep {
  distance: number;
  name: string;
  type: string;
  modifier?: string;
  location: [number, number];
}

export interface OsrmRouteResponse {
  code?: string;
  message?: string;
  routes?: Array<{
    geometry: LineString;
    legs: Array<{
      steps: Array<{
        distance: number;
        name?: string;
        maneuver: {
          type: string;
          modifier?: string;
          location: [number, number];
        };
      }>;
    }>;
    distance: number;
    duration: number;
  }>;
}

export class OsrmError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'OsrmError';
  }
}

export const buildOsrmUrl = (baseUrl: string, path: string): string => {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

const parseRouteSteps = (route: NonNullable<OsrmRouteResponse['routes']>[number]): NavStep[] => {
  const steps: NavStep[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      steps.push({
        distance: step.distance,
        name: step.name ?? '',
        type: step.maneuver.type,
        modifier: step.maneuver.modifier,
        location: step.maneuver.location,
      });
    }
  }
  return steps;
};

const requestOsrm = async (url: string): Promise<OsrmRouteResponse> => {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    console.error('[OSRM] fetch failed:', url, message);
    throw new OsrmError(`OSRM inaccessible : ${message}`);
  }

  const raw = await response.text();
  let json: OsrmRouteResponse;
  try {
    json = JSON.parse(raw) as OsrmRouteResponse;
  } catch {
    console.error('[OSRM] invalid JSON response:', url, response.status, raw.slice(0, 200));
    const hint =
      response.status === 502
        ? 'Service de routage indisponible (502). Le conteneur OSRM est peut-être arrêté ou les données cartographiques (region.osrm) manquent.'
        : `Réponse OSRM invalide (${response.status})`;
    throw new OsrmError(hint, response.status);
  }

  if (!response.ok) {
    const detail = json.message ?? json.code ?? response.statusText;
    console.error('[OSRM] HTTP error:', url, response.status, detail);
    throw new OsrmError(`OSRM erreur ${response.status} : ${detail}`, response.status, json.code);
  }

  if (json.code && json.code !== 'Ok') {
    console.error('[OSRM] routing error:', url, json.code, json.message);
    throw new OsrmError(json.message ?? `Itinéraire impossible (${json.code})`, response.status, json.code);
  }

  if (!json.routes?.length) {
    console.error('[OSRM] no routes in response:', url);
    throw new OsrmError('Aucun itinéraire trouvé');
  }

  return json;
};

export const fetchRouteSteps = async (
  waypoints: [number, number][],
  osrmUrl: string,
): Promise<NavStep[]> => {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const url = buildOsrmUrl(osrmUrl, `/route/v1/driving/${coords}?steps=true&geometries=geojson&overview=false`);
  const json = await requestOsrm(url);
  return parseRouteSteps(json.routes![0]);
};

export const fetchRouteWithSteps = async (
  waypoints: [number, number][],
  osrmUrl: string,
): Promise<{ geoJSON: FeatureCollection<LineString>; steps: NavStep[] }> => {
  if (waypoints.length < 2) {
    throw new OsrmError('Au moins 2 points requis pour calculer un itinéraire');
  }
  const coords = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const url = buildOsrmUrl(
    osrmUrl,
    `/route/v1/driving/${coords}?steps=true&geometries=geojson&overview=full`,
  );
  const json = await requestOsrm(url);
  const route = json.routes![0];
  return {
    geoJSON: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: route.geometry, properties: {} }],
    },
    steps: parseRouteSteps(route),
  };
};

export const fetchRoute = async (
  start: [number, number],
  end: [number, number],
  osrmUrl: string,
): Promise<FeatureCollection<LineString> | null> => {
  const url = buildOsrmUrl(
    osrmUrl,
    `/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`,
  );
  try {
    const json = await requestOsrm(url);
    const geometry = json.routes![0].geometry;
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry, properties: {} }],
    };
  } catch {
    return null;
  }
};

export const fetchRouteToPoi = async (
  start: [number, number],
  end: [number, number],
  osrmUrl: string,
): Promise<{ geoJSON: FeatureCollection<LineString>; distance: number; duration: number } | null> => {
  const url = buildOsrmUrl(
    osrmUrl,
    `/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`,
  );
  try {
    const json = await requestOsrm(url);
    const route = json.routes![0];
    return {
      geoJSON: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: route.geometry, properties: {} }],
      },
      distance: route.distance,
      duration: route.duration,
    };
  } catch {
    return null;
  }
};

export const watchUserPosition = (
  onUpdate: (coords: [number, number], heading: number | null, speed: number | null) => void,
): (() => void) => {
  if (!navigator.geolocation) {
    return () => {};
  }

  const toCoords = (position: GeolocationPosition): void => {
    onUpdate(
      [position.coords.longitude, position.coords.latitude],
      position.coords.heading ?? null,
      position.coords.speed ?? null,
    );
  };

  navigator.geolocation.getCurrentPosition(toCoords, () => {}, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
  });

  const watchId = navigator.geolocation.watchPosition(toCoords, () => {}, {
    enableHighAccuracy: true,
    maximumAge: 1000,
  });

  return () => navigator.geolocation.clearWatch(watchId);
};
