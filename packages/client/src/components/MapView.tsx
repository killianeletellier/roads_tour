import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, LineString } from 'geojson';
import type { ConvoyMemberInfo } from '@roads-tour/shared';
import { CrosshairIcon } from './Icons';

interface MapViewProps {
  routeGeoJSON?: FeatureCollection<LineString> | null;
  recalcGeoJSON?: FeatureCollection<LineString> | null;
  userLocation?: [number, number] | null;
  userHeading?: number | null;
  members?: ConvoyMemberInfo[];
  pois?: Array<{ lat: number; lon: number; label: string; order: number }>;
  highlightPois?: boolean;
  compact?: boolean;
  navigationMode?: boolean;
  bottomPadding?: number;
  className?: string;
}

const ACCENT = '#D14F8B';
const ACCENT_LIGHT = 'rgba(209, 79, 139, 0.45)';
const NAV_ZOOM = 16;

const EMPTY_FC: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };

const createPoiElement = (order: number, label: string, highlight: boolean): HTMLDivElement => {
  const wrap = document.createElement('div');
  wrap.className = highlight ? 'poi-marker poi-marker--highlight' : 'poi-marker';
  wrap.title = label;

  if (highlight) {
    const pulse = document.createElement('div');
    pulse.className = 'poi-marker__pulse';
    wrap.appendChild(pulse);
  }

  const core = document.createElement('div');
  core.className = 'poi-marker__core';
  core.textContent = String(order);
  wrap.appendChild(core);

  if (label) {
    const caption = document.createElement('div');
    caption.className = 'poi-marker__label';
    caption.textContent = label;
    wrap.appendChild(caption);
  }

  return wrap;
};

const createUserMarkerElement = (heading: number | null | undefined): HTMLDivElement => {
  const wrap = document.createElement('div');
  wrap.className = 'user-marker';

  const ring = document.createElement('div');
  ring.className = 'user-marker__ring';
  wrap.appendChild(ring);

  const dot = document.createElement('div');
  dot.className = 'user-marker__dot';
  wrap.appendChild(dot);

  if (heading != null) {
    const arrow = document.createElement('div');
    arrow.className = 'user-marker__heading';
    arrow.style.transform = `rotate(${heading}deg)`;
    wrap.appendChild(arrow);
  }

  return wrap;
};

export const MapView = ({
  routeGeoJSON,
  recalcGeoJSON,
  userLocation,
  userHeading,
  members = [],
  pois = [],
  highlightPois = false,
  compact = false,
  navigationMode = false,
  bottomPadding = 0,
  className = '',
}: MapViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const memberMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const poiMarkersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const routeGeoJSONRef = useRef(routeGeoJSON);
  const recalcGeoJSONRef = useRef(recalcGeoJSON);
  routeGeoJSONRef.current = routeGeoJSON;
  recalcGeoJSONRef.current = recalcGeoJSON;
  const autoFollow = navigationMode || compact;
  const [isFollowingUser, setIsFollowingUser] = useState(autoFollow);
  const isFollowingUserRef = useRef(isFollowingUser);
  isFollowingUserRef.current = isFollowingUser;

  useEffect(() => {
    if (navigationMode) {
      setIsFollowingUser(true);
    }
  }, [navigationMode]);

  const recenterOnUser = useCallback(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    setIsFollowingUser(true);
    map.easeTo({
      center: userLocation,
      zoom: NAV_ZOOM,
      padding: { top: 48, bottom: bottomPadding, left: 24, right: 24 },
      duration: 500,
    });
  }, [userLocation, bottomPadding]);

  const applyGeoJSONSource = useCallback((
    sourceId: 'route' | 'recalc',
    data: FeatureCollection<LineString> | null | undefined,
  ) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return false;
    const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!src) return false;
    src.setData(data ?? EMPTY_FC);
    return true;
  }, []);

  const syncRouteLayers = useCallback(() => {
    applyGeoJSONSource('route', routeGeoJSONRef.current);
    applyGeoJSONSource('recalc', recalcGeoJSONRef.current);
  }, [applyGeoJSONSource]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapReadyRef.current = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [2.3522, 48.8566],
      zoom: navigationMode ? NAV_ZOOM : compact ? 10 : 6,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const initRouteLayers = () => {
      if (!map.getSource('route')) {
        map.addSource('route', { type: 'geojson', data: EMPTY_FC });
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': navigationMode ? 10 : 6,
            'line-opacity': 0.85,
          },
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ACCENT,
            'line-width': navigationMode ? 6 : 4,
          },
        });
      }

      if (!map.getSource('recalc')) {
        map.addSource('recalc', { type: 'geojson', data: EMPTY_FC });
        map.addLayer({
          id: 'recalc-line',
          type: 'line',
          source: 'recalc',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ACCENT_LIGHT,
            'line-width': navigationMode ? 5 : 3,
            'line-dasharray': [2, 2],
          },
        });
      }

      mapReadyRef.current = true;
      syncRouteLayers();
      map.resize();
    };

    map.on('load', initRouteLayers);

    const onUserMoveStart = (e: maplibregl.MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>) => {
      if (navigationMode && e.originalEvent) {
        setIsFollowingUser(false);
      }
    };
    map.on('dragstart', onUserMoveStart);
    map.on('zoomstart', onUserMoveStart);

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.resize())
      : null;
    ro?.observe(containerRef.current);

    return () => {
      ro?.disconnect();
      map.off('dragstart', onUserMoveStart);
      map.off('zoomstart', onUserMoveStart);
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [compact, navigationMode, syncRouteLayers]);

  useEffect(() => {
    if (!applyGeoJSONSource('route', routeGeoJSON)) {
      const map = mapRef.current;
      if (!map) return;
      const retry = () => {
        if (applyGeoJSONSource('route', routeGeoJSON)) {
          map.off('load', retry);
          map.off('idle', retry);
        }
      };
      map.on('load', retry);
      map.on('idle', retry);
      return () => {
        map.off('load', retry);
        map.off('idle', retry);
      };
    }
  }, [routeGeoJSON, applyGeoJSONSource]);

  useEffect(() => {
    if (!applyGeoJSONSource('recalc', recalcGeoJSON)) {
      const map = mapRef.current;
      if (!map) return;
      const retry = () => {
        if (applyGeoJSONSource('recalc', recalcGeoJSON)) {
          map.off('load', retry);
          map.off('idle', retry);
        }
      };
      map.on('load', retry);
      map.on('idle', retry);
      return () => {
        map.off('load', retry);
        map.off('idle', retry);
      };
    }
  }, [recalcGeoJSON, applyGeoJSONSource]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = poiMarkersRef.current;
    const orders = new Set(pois.map(p => p.order));

    for (const [order, marker] of existing) {
      if (!orders.has(order)) {
        marker.remove();
        existing.delete(order);
      }
    }

    for (const p of pois) {
      const lngLat: [number, number] = [p.lon, p.lat];
      let marker = existing.get(p.order);
      if (!marker) {
        const el = createPoiElement(p.order, p.label, highlightPois);
        marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
        existing.set(p.order, marker);
      } else {
        marker.setLngLat(lngLat);
        const el = marker.getElement();
        const core = el.querySelector('.poi-marker__core');
        if (core) core.textContent = String(p.order);
        const caption = el.querySelector('.poi-marker__label');
        if (caption) caption.textContent = p.label;
      }
    }
  }, [pois, highlightPois]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    if (!userMarkerRef.current) {
      const el = createUserMarkerElement(userHeading);
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(userLocation)
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat(userLocation);
      const arrow = userMarkerRef.current.getElement().querySelector('.user-marker__heading') as HTMLElement | null;
      if (arrow && userHeading != null) {
        arrow.style.transform = `rotate(${userHeading}deg)`;
      }
    }

    if (isFollowingUserRef.current && autoFollow) {
      map.easeTo({
        center: userLocation,
        zoom: navigationMode ? NAV_ZOOM : map.getZoom(),
        padding: { top: 48, bottom: bottomPadding, left: 24, right: 24 },
        duration: 500,
      });
    }
  }, [userLocation, userHeading, autoFollow, navigationMode, bottomPadding]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = memberMarkersRef.current;
    const ids = new Set(members.filter(m => m.lat != null && m.lon != null).map(m => m.id));
    for (const [id, marker] of existing) {
      if (!ids.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
    for (const m of members) {
      if (m.lat == null || m.lon == null) continue;
      const color = m.role === 'organizer' ? ACCENT : '#6b7280';
      let marker = existing.get(m.id);
      if (!marker) {
        const el = document.createElement('div');
        el.style.cssText = `width:24px;height:24px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.25)`;
        el.textContent = m.organizerRole?.[0]?.toUpperCase() ?? m.displayName[0]?.toUpperCase() ?? '?';
        marker = new maplibregl.Marker({ element: el }).setLngLat([m.lon, m.lat]).addTo(map);
        existing.set(m.id, marker);
      } else {
        marker.setLngLat([m.lon, m.lat]);
      }
    }
  }, [members]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || autoFollow || !routeGeoJSON?.features.length) return;
    const allCoords = routeGeoJSON.features.flatMap(f => f.geometry.coordinates);
    if (allCoords.length < 2) return;
    const bounds = allCoords.reduce(
      (b, c) => b.extend(c as [number, number]),
      new maplibregl.LngLatBounds(allCoords[0] as [number, number], allCoords[0] as [number, number]),
    );
    for (const p of pois) bounds.extend([p.lon, p.lat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: 14 });
  }, [routeGeoJSON, pois, autoFollow]);

  const heightStyle = navigationMode
    ? { height: '100%', minHeight: 0 }
    : compact
      ? { height: '200px', minHeight: '200px' }
      : { height: '100%', minHeight: '300px' };

  return (
    <div
      className={`map-view ${navigationMode ? 'map-view--navigation' : ''} ${className}`.trim()}
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: navigationMode ? 0 : 8,
        overflow: 'hidden',
        ...heightStyle,
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
      {navigationMode && !isFollowingUser && userLocation && (
        <button
          type="button"
          className="map-view__recenter btn-icon no-select"
          style={{ bottom: `calc(${bottomPadding + 16}px + env(safe-area-inset-bottom, 0px))` }}
          onClick={recenterOnUser}
          aria-label="Recentrer sur ma position"
        >
          <CrosshairIcon />
        </button>
      )}
    </div>
  );
};
