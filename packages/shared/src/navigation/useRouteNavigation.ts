import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString } from 'geojson';
import type { ConvoyRoute } from '../types.js';
import {
  OFF_ROUTE_THRESHOLD_M,
  POINT_REACHED_THRESHOLD_M,
  RECALC_COOLDOWN_MS,
  STEP_PASSED_THRESHOLD_M,
  DEFAULT_SPEED_KMH,
} from '../constants.js';
import { fetchRouteSteps, fetchRouteWithSteps, OsrmError, type NavStep } from './geolocation.js';
import { haversineDistance, nearestPointOnPolyline } from './geometry.js';

export interface NavigationPoint {
  id: string;
  order: number;
  latitude: number;
  longitude: number;
  label: string;
}

export interface NavigationInstruction {
  type: string;
  modifier?: string;
  name: string;
  distanceM: number;
}

export interface UseRouteNavigationOptions {
  osrmUrl: string;
  onOffRoute?: (distance: number) => void;
  onOsrmError?: (message: string) => void;
}

const markPassedSteps = (
  userLocation: [number, number],
  steps: NavStep[],
  passedRef: { current: Set<number> },
  setPassed: (s: Set<number>) => void,
) => {
  steps.forEach((step, i) => {
    if (passedRef.current.has(i)) return;
    const dist = haversineDistance(userLocation, step.location);
    if (dist < STEP_PASSED_THRESHOLD_M) {
      passedRef.current = new Set([...passedRef.current, i]);
      setPassed(new Set(passedRef.current));
    }
  });
};

const buildRouteGeoJSON = (apiRoute: ConvoyRoute | null): FeatureCollection<LineString> | null => {
  if (!apiRoute?.segments?.length) return null;
  const features: FeatureCollection<LineString>['features'] = [];

  for (const seg of [...apiRoute.segments].sort((a, b) => a.order - b.order)) {
    const coords = seg.gpsCoordinates.map(c => [c.lon, c.lat]);
    if (coords.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { segmentId: seg.id },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
  }

  if (!features.length) return null;
  return { type: 'FeatureCollection', features };
};

export const useRouteNavigation = (
  apiRoute: ConvoyRoute | null,
  userLocation: [number, number] | null,
  options: UseRouteNavigationOptions,
) => {
  const { osrmUrl, onOffRoute, onOsrmError } = options;
  const lastRecalcRef = useRef<number>(0);
  const lastNextPointIdRef = useRef<string | null>(null);
  const lastNavFetchKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const visitedPointIdsRef = useRef<Set<string>>(new Set());
  const passedStepIndicesRef = useRef<Set<number>>(new Set());
  const recalcPassedStepIndicesRef = useRef<Set<number>>(new Set());
  const wasOffRouteRef = useRef(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const [visitedPointIds, setVisitedPointIds] = useState<Set<string>>(new Set());
  const [recalcGeoJSON, setRecalcGeoJSON] = useState<FeatureCollection<LineString> | null>(null);
  const [recalcNavSteps, setRecalcNavSteps] = useState<NavStep[]>([]);
  const [recalcPassedStepIndices, setRecalcPassedStepIndices] = useState<Set<number>>(new Set());
  const [validatedPoint, setValidatedPoint] = useState<NavigationPoint | null>(null);
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [passedStepIndices, setPassedStepIndices] = useState<Set<number>>(new Set());
  const [offRouteDistance, setOffRouteDistance] = useState<number | null>(null);
  const [osrmError, setOsrmError] = useState<string | null>(null);
  const [osrmLoading, setOsrmLoading] = useState(false);

  useEffect(() => {
    visitedPointIdsRef.current = new Set();
    passedStepIndicesRef.current = new Set();
    recalcPassedStepIndicesRef.current = new Set();
    wasOffRouteRef.current = false;
    lastNavFetchKeyRef.current = null;
    setVisitedPointIds(new Set());
    setRecalcGeoJSON(null);
    setRecalcNavSteps([]);
    setRecalcPassedStepIndices(new Set());
    setValidatedPoint(null);
    setNavSteps([]);
    setPassedStepIndices(new Set());
    setOffRouteDistance(null);
    setOsrmError(null);
    setOsrmLoading(false);
    lastRecalcRef.current = 0;
    lastNextPointIdRef.current = null;
  }, [apiRoute?.id]);

  const sortedPoints = useMemo(
    () => apiRoute?.points ? [...apiRoute.points].sort((a, b) => a.order - b.order) : [],
    [apiRoute],
  );

  const nextPoint = useMemo(
    () => sortedPoints.find(p => !visitedPointIds.has(p.id)) ?? null,
    [sortedPoints, visitedPointIds],
  );

  const routeGeoJSON = useMemo(() => buildRouteGeoJSON(apiRoute), [apiRoute]);

  const routePolyline = useMemo(
    (): [number, number][] =>
      (routeGeoJSON?.features.flatMap(f => f.geometry.coordinates) ?? []) as [number, number][],
    [routeGeoJSON],
  );

  const distanceToNextM = useMemo((): number | null => {
    if (!userLocation || !nextPoint) return null;
    return haversineDistance(userLocation, [nextPoint.longitude, nextPoint.latitude]);
  }, [userLocation, nextPoint]);

  const estimatedMinutesRemaining = useMemo((): number | null => {
    if (!apiRoute?.segments || !nextPoint) return null;
    const nextIdx = sortedPoints.findIndex(p => p.id === nextPoint.id);
    const remainingIds = new Set(sortedPoints.slice(nextIdx).map(p => p.id));
    const total = apiRoute.segments
      .filter(seg => remainingIds.has(seg.startPointId))
      .reduce((sum, seg) => sum + (seg.estimatedDurationMinutes ?? 0), 0);
    return total || null;
  }, [nextPoint, sortedPoints, apiRoute]);

  const totalRemainingKm = useMemo((): number | null => {
    if (!apiRoute?.segments || !nextPoint) return null;
    const nextIdx = sortedPoints.findIndex(p => p.id === nextPoint.id);
    const remainingIds = new Set(sortedPoints.slice(nextIdx).map(p => p.id));
    const totalM = apiRoute.segments
      .filter(seg => remainingIds.has(seg.startPointId))
      .reduce((sum, seg) => sum + seg.lengthM, 0);
    return totalM / 1000;
  }, [nextPoint, sortedPoints, apiRoute]);

  const isOffRoute = offRouteDistance != null;

  const currentInstruction = useMemo((): NavigationInstruction | null => {
    if (!userLocation) return null;

    const steps = isOffRoute && recalcNavSteps.length ? recalcNavSteps : navSteps;
    const passed = isOffRoute && recalcNavSteps.length ? recalcPassedStepIndices : passedStepIndices;

    if (steps.length) {
      const upcoming = steps.find((_, i) => !passed.has(i));
      if (upcoming) {
        return {
          type: upcoming.type,
          modifier: upcoming.modifier,
          name: upcoming.name,
          distanceM: haversineDistance(userLocation, upcoming.location),
        };
      }
    }

    if (nextPoint) {
      return {
        type: 'continue',
        name: nextPoint.label || 'Prochain point',
        distanceM: haversineDistance(userLocation, [nextPoint.longitude, nextPoint.latitude]),
      };
    }

    return null;
  }, [userLocation, isOffRoute, recalcNavSteps, recalcPassedStepIndices, navSteps, passedStepIndices, nextPoint]);

  const handleOsrmFailure = (err: unknown) => {
    const message = err instanceof OsrmError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Impossible de calculer l\'itinéraire';
    if (mountedRef.current) {
      setOsrmError(message);
      setOsrmLoading(false);
    }
    onOsrmError?.(message);
  };

  useEffect(() => {
    if (!userLocation || !nextPoint) return;

    const fetchKey = `${nextPoint.id}:${userLocation[0].toFixed(3)},${userLocation[1].toFixed(3)}`;
    if (lastNavFetchKeyRef.current === fetchKey) return;
    lastNavFetchKeyRef.current = fetchKey;

    let alive = true;
    setOsrmLoading(true);
    setOsrmError(null);

    fetchRouteSteps(
      [userLocation, [nextPoint.longitude, nextPoint.latitude]],
      osrmUrl,
    )
      .then(steps => {
        if (!alive || !mountedRef.current) return;
        setOsrmLoading(false);
        if (!steps.length) {
          setOsrmError('Aucune instruction de navigation disponible');
          return;
        }
        passedStepIndicesRef.current = new Set([0]);
        setNavSteps(steps);
        setPassedStepIndices(new Set([0]));
        setOsrmError(null);
      })
      .catch(err => {
        if (!alive) return;
        handleOsrmFailure(err);
      });

    return () => { alive = false; };
  }, [userLocation, nextPoint, osrmUrl, onOsrmError]);

  useEffect(() => {
    if (!userLocation) return;

    let firstReachedPoint: typeof sortedPoints[number] | null = null;
    sortedPoints.forEach(point => {
      if (visitedPointIdsRef.current.has(point.id)) return;
      const dist = haversineDistance(userLocation, [point.longitude, point.latitude]);
      if (dist < POINT_REACHED_THRESHOLD_M) {
        visitedPointIdsRef.current = new Set([...visitedPointIdsRef.current, point.id]);
        if (!firstReachedPoint) firstReachedPoint = point;
      }
    });
    if (firstReachedPoint) {
      setVisitedPointIds(new Set(visitedPointIdsRef.current));
      setValidatedPoint(firstReachedPoint);
    }

    markPassedSteps(userLocation, navSteps, passedStepIndicesRef, setPassedStepIndices);
    if (recalcNavSteps.length) {
      markPassedSteps(userLocation, recalcNavSteps, recalcPassedStepIndicesRef, setRecalcPassedStepIndices);
    }

    if (!routePolyline.length || !nextPoint) return;

    if (nextPoint.id !== lastNextPointIdRef.current) {
      lastNextPointIdRef.current = nextPoint.id;
      lastRecalcRef.current = 0;
      lastNavFetchKeyRef.current = null;
      setRecalcGeoJSON(null);
      setRecalcNavSteps([]);
      recalcPassedStepIndicesRef.current = new Set();
      setRecalcPassedStepIndices(new Set());
    }

    const { distance } = nearestPointOnPolyline(userLocation, routePolyline);
    const offRoute = distance > OFF_ROUTE_THRESHOLD_M;
    setOffRouteDistance(offRoute ? distance : null);

    if (offRoute) {
      if (!wasOffRouteRef.current) {
        wasOffRouteRef.current = true;
        onOffRoute?.(distance);
      }
      const now = Date.now();
      if (now - lastRecalcRef.current > RECALC_COOLDOWN_MS) {
        lastRecalcRef.current = now;
        const dest: [number, number] = [nextPoint.longitude, nextPoint.latitude];
        fetchRouteWithSteps([userLocation, dest], osrmUrl)
          .then(result => {
            if (!mountedRef.current) return;
            recalcPassedStepIndicesRef.current = new Set([0]);
            setRecalcGeoJSON(result.geoJSON);
            setRecalcNavSteps(result.steps);
            setRecalcPassedStepIndices(new Set([0]));
          })
          .catch(handleOsrmFailure);
      }
    } else {
      wasOffRouteRef.current = false;
      setRecalcGeoJSON(null);
      setRecalcNavSteps([]);
      recalcPassedStepIndicesRef.current = new Set();
      setRecalcPassedStepIndices(new Set());
    }
  }, [userLocation, sortedPoints, navSteps, recalcNavSteps.length, nextPoint, routePolyline, osrmUrl, onOffRoute]);

  const etaMinutesFromSpeed = useMemo((): number | null => {
    if (distanceToNextM == null) return null;
    return (distanceToNextM / 1000 / DEFAULT_SPEED_KMH) * 60;
  }, [distanceToNextM]);

  return {
    sortedPoints,
    nextPoint,
    routeGeoJSON,
    recalcGeoJSON,
    visitedPointIds,
    validatedPoint,
    setValidatedPoint,
    distanceToNextM,
    estimatedMinutesRemaining,
    totalRemainingKm,
    currentInstruction,
    offRouteDistance,
    etaMinutesFromSpeed,
    osrmError,
    osrmLoading,
  };
};
