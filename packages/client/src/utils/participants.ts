import type { ConvoyMemberInfo } from '@roads-tour/shared';
import { CONNECTED_THRESHOLD_MS } from '@roads-tour/shared';

export { CONNECTED_THRESHOLD_MS };

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
