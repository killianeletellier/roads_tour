import type { ConvoyMemberInfo } from '@roads-tour/shared';

/** Consider a member connected if seen within this window (3× position interval). */
export const CONNECTED_THRESHOLD_MS = 30_000;

export const isConnectedMember = (m: ConvoyMemberInfo): boolean => {
  if (!m.lastSeen) return false;
  return Date.now() - new Date(m.lastSeen).getTime() < CONNECTED_THRESHOLD_MS;
};

export const isConnectedParticipant = (m: ConvoyMemberInfo): boolean =>
  m.role === 'participant' && isConnectedMember(m);

export const getConnectedMembers = (members: ConvoyMemberInfo[]): ConvoyMemberInfo[] =>
  members.filter(isConnectedMember);

export const getConnectedParticipants = (members: ConvoyMemberInfo[]): ConvoyMemberInfo[] =>
  members.filter(isConnectedParticipant);
