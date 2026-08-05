import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import {
  getConvoy,
  updateConvoy,
  deleteConvoy,
  uploadGpx,
  updateSegment,
  reorderSegments,
  deleteSegment,
  type ConvoyDetail,
} from '../../api';
import { MapView } from '../../components/MapView';
import type { FeatureCollection, LineString } from 'geojson';
import type { Segment } from '@roads-tour/shared';

const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const formatDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`);

export const AdminConvoyPage = () => {
  const { id } = useParams<{ id: string }>();
  const [convoy, setConvoy] = useState<ConvoyDetail | null>(null);
  const [error, setError] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { refreshConvoys } = useOutletContext<{ refreshConvoys: () => void }>();

  const load = () => {
    if (!id) return;
    getConvoy(id).then(setConvoy).catch(() => setError('Convoi introuvable'));
  };

  useEffect(load, [id]);

  const sortedSegments = convoy?.segments.slice().sort((a, b) => a.order - b.order) ?? [];

  const routeGeoJSON: FeatureCollection<LineString> | null = sortedSegments.length
    ? {
        type: 'FeatureCollection',
        features: sortedSegments.map(seg => ({
          type: 'Feature' as const,
          properties: { name: seg.name },
          geometry: seg.geometry,
        })),
      }
    : null;

  const pois = sortedSegments.map((seg, i) => ({
    lat: seg.poi.lat,
    lon: seg.poi.lon,
    label: seg.name || seg.poi.label,
    order: i + 1,
  }));

  const handleGpx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length || !id) return;
    setUploading(true);
    setError('');
    try {
      const mode = importMode === 'append' && convoy!.segments.length > 0 ? 'append' : 'replace';
      const updated = await uploadGpx(id, files, mode);
      setConvoy(updated);
      refreshConvoys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import échoué');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const copyCode = () => {
    if (convoy) navigator.clipboard.writeText(convoy.accessCode);
  };

  const setStatus = async (status: string) => {
    if (!id) return;
    const updated = await updateConvoy(id, { status });
    setConvoy(updated);
    refreshConvoys();
  };

  const remove = async () => {
    if (!id || !confirm('Supprimer ce convoi ?')) return;
    await deleteConvoy(id);
    refreshConvoys();
    window.location.href = '/admin/convoys/new';
  };

  const handleRename = async (segmentId: string, name: string) => {
    if (!id) return;
    try {
      const updated = await updateSegment(id, segmentId, { name });
      setConvoy(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour échouée');
    }
  };

  const moveSegment = async (segmentId: string, direction: 'up' | 'down') => {
    if (!id) return;
    const ids = sortedSegments.map(s => s.id);
    const idx = ids.indexOf(segmentId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    try {
      const updated = await reorderSegments(id, ids);
      setConvoy(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Réordonnancement échoué');
    }
  };

  const removeSegment = async (segmentId: string) => {
    if (!id || !confirm('Supprimer ce segment ?')) return;
    try {
      const updated = await deleteSegment(id, segmentId);
      setConvoy(updated);
      refreshConvoys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression échouée');
    }
  };

  if (!convoy) return error ? <div>{error}</div> : <div>Chargement…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>{convoy.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <code style={{ background: '#eee', padding: '0.25rem 0.5rem', borderRadius: 4 }}>{convoy.accessCode}</code>
            <button className="btn-secondary btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }} onClick={copyCode}>Copier</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select className="input" value={convoy.status} onChange={e => setStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="draft">Brouillon</option>
            <option value="ready">Prêt</option>
            <option value="active">Actif</option>
            <option value="archived">Archivé</option>
          </select>
          <button className="btn-secondary btn" onClick={remove} style={{ color: 'var(--danger)' }}>Supprimer</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Import GPX</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".gpx" multiple hidden onChange={handleGpx} />
          <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Import en cours…' : 'Importer GPX'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem' }}>
            <input
              type="radio"
              name="importMode"
              checked={importMode === 'replace'}
              onChange={() => setImportMode('replace')}
            />
            Remplacer tout
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem' }}>
            <input
              type="radio"
              name="importMode"
              checked={importMode === 'append'}
              onChange={() => setImportMode('append')}
            />
            Ajouter aux segments existants
          </label>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
            {sortedSegments.length} segment{sortedSegments.length !== 1 ? 's' : ''} · sélection multiple possible
          </span>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden', height: '400px', marginBottom: '1rem' }}>
        <MapView routeGeoJSON={routeGeoJSON} pois={pois} highlightPois />
      </div>

      {sortedSegments.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Segments ({sortedSegments.length})</h2>
          <ul className="segment-list">
            {sortedSegments.map((seg, idx) => (
              <SegmentRow
                key={seg.id}
                segment={seg}
                index={idx}
                total={sortedSegments.length}
                onRename={handleRename}
                onMove={moveSegment}
                onDelete={removeSegment}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

interface SegmentRowProps {
  segment: Segment;
  index: number;
  total: number;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
}

const SegmentRow = ({ segment, index, total, onRename, onMove, onDelete }: SegmentRowProps) => {
  const [name, setName] = useState(segment.name || segment.poi.label);
  const saveName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== (segment.name || segment.poi.label)) {
      onRename(segment.id, trimmed);
    }
  }, [name, onRename, segment.id, segment.name, segment.poi.label]);

  useEffect(() => {
    setName(segment.name || segment.poi.label);
  }, [segment.name, segment.poi.label]);

  return (
    <li className="segment-item">
      <div className="segment-order">{index + 1}</div>
      <div className="segment-body">
        <input
          className="input segment-name-input"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          placeholder={`Segment ${index + 1}`}
        />
        <div className="segment-meta">
          <span>{formatDistance(segment.lengthM)}</span>
          <span>·</span>
          <span>{formatDuration(segment.durationMin)}</span>
          <span>·</span>
          <span>POI : {segment.poi.label}</span>
        </div>
      </div>
      <div className="segment-actions">
        <button
          className="btn-icon"
          title="Monter"
          disabled={index === 0}
          onClick={() => onMove(segment.id, 'up')}
          aria-label="Monter"
        >↑</button>
        <button
          className="btn-icon"
          title="Descendre"
          disabled={index === total - 1}
          onClick={() => onMove(segment.id, 'down')}
          aria-label="Descendre"
        >↓</button>
        <button
          className="btn-icon"
          title="Supprimer"
          onClick={() => onDelete(segment.id)}
          aria-label="Supprimer"
          style={{ color: 'var(--danger)' }}
        >×</button>
      </div>
    </li>
  );
};
