import type { ConvoyMemberInfo } from '@roads-tour/shared';

/** Consider a participant connected if seen within this window (3× position interval). */
export const CONNECTED_THRESHOLD_MS = 30_000;

export const isConnectedParticipant = (m: ConvoyMemberInfo): boolean => {
  if (m.role !== 'participant') return false;
  if (!m.lastSeen) return false;
  return Date.now() - new Date(m.lastSeen).getTime() < CONNECTED_THRESHOLD_MS;
};

export const getConnectedParticipants = (members: ConvoyMemberInfo[]): ConvoyMemberInfo[] =>
  members.filter(isConnectedParticipant);
