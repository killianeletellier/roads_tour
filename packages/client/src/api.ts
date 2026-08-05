import type {
  ConvoyDetail,
  ConvoySummary,
  JoinResponse,
  ConvoyRoute,
} from '@roads-tour/shared';

const api = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
};

export const adminLogin = (password: string) =>
  api<{ ok: boolean; token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

export const adminLogout = () =>
  api<{ ok: boolean }>('/api/admin/logout', { method: 'POST' });

export const checkAdmin = () =>
  api<{ ok: boolean }>('/api/admin/me');

export const listConvoys = () =>
  api<ConvoySummary[]>('/api/admin/convoys');

export const getConvoy = (id: string) =>
  api<ConvoyDetail>(`/api/admin/convoys/${id}`);

export const createConvoy = (data: {
  name: string;
  accessCode?: string;
  adminPassword: string;
  status?: string;
}) =>
  api<ConvoyDetail>('/api/admin/convoys', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateConvoy = (id: string, data: Record<string, unknown>) =>
  api<ConvoyDetail>(`/api/admin/convoys/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteConvoy = (id: string) =>
  api<{ ok: boolean }>(`/api/admin/convoys/${id}`, { method: 'DELETE' });

export const uploadGpx = async (
  id: string,
  files: File[],
  mode: 'replace' | 'append' = 'replace',
): Promise<ConvoyDetail> => {
  const form = new FormData();
  for (const file of files) {
    form.append('file', file);
  }
  const res = await fetch(`/api/admin/convoys/${id}/gpx?mode=${mode}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Upload failed');
  }
  return res.json();
};

export const updateSegment = (
  convoyId: string,
  segmentId: string,
  data: { name?: string; order?: number },
) =>
  api<ConvoyDetail>(`/api/admin/convoys/${convoyId}/segments/${segmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const reorderSegments = (convoyId: string, segmentIds: string[]) =>
  api<ConvoyDetail>(`/api/admin/convoys/${convoyId}/segments/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ segmentIds }),
  });

export const deleteSegment = (convoyId: string, segmentId: string) =>
  api<ConvoyDetail>(`/api/admin/convoys/${convoyId}/segments/${segmentId}`, {
    method: 'DELETE',
  });

export const getConvoyByCode = (code: string) =>
  api<{ id: string; name: string; accessCode: string; status: string; segmentCount: number }>(
    `/api/convoys/by-code/${encodeURIComponent(code)}`,
  );

export const joinConvoy = (
  id: string,
  data: {
    displayName: string;
    role?: 'participant' | 'organizer';
    adminPassword?: string;
    organizerRole?: 'lead' | 'sweep' | 'door';
  },
) =>
  api<JoinResponse>(`/api/convoys/${id}/join`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getAppConfig = () =>
  api<{ osrmUrl: string }>('/api/config');

export type { ConvoyDetail, ConvoySummary, JoinResponse, ConvoyRoute };
