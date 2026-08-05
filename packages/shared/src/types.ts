export type ConvoyStatus = 'draft' | 'ready' | 'active' | 'archived';
export type MemberRole = 'participant' | 'organizer';
export type OrganizerRole = 'lead' | 'sweep' | 'door' | null;

export interface POI {
  id: string;
  lat: number;
  lon: number;
  label: string;
}

export interface Segment {
  id: string;
  order: number;
  name: string;
  geometry: GeoJSON.LineString;
  lengthM: number;
  durationMin: number;
  poi: POI;
}

export interface ConvoySummary {
  id: string;
  name: string;
  accessCode: string;
  status: ConvoyStatus;
  segmentCount: number;
  createdAt: string;
}

export interface ConvoyDetail extends ConvoySummary {
  segments: Segment[];
}

export interface ConvoyRoute {
  id: string;
  name: string;
  segments: Array<{
    id: string;
    order: number;
    gpsCoordinates: Array<{ lon: number; lat: number }>;
    lengthM: number;
    estimatedDurationMinutes: number;
    startPointId: string;
  }>;
  points: Array<{
    id: string;
    order: number;
    latitude: number;
    longitude: number;
    label: string;
  }>;
}

export interface ConvoyMemberInfo {
  id: string;
  displayName: string;
  role: MemberRole;
  organizerRole: OrganizerRole;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speed: number | null;
  isOffRoute: boolean;
  lastSeen: string | null;
}

export interface JoinResponse {
  memberId: string;
  token: string;
  convoy: ConvoyRoute;
  role: MemberRole;
  organizerRole: OrganizerRole;
}

export interface PositionUpdate {
  memberId: string;
  lat: number;
  lon: number;
  heading?: number | null;
  speed?: number | null;
}

export interface OffRouteEvent {
  memberId: string;
  displayName: string;
  distance: number;
}

export interface PositionsToggleEvent {
  visible: boolean;
}

export * from './constants.js';
