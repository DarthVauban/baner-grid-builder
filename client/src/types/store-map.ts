export type StoreMapPublicationStatus = 'ACTIVE' | 'HIDDEN';
export type StoreMapOpenStatusOverride = 'AUTO' | 'TEMPORARILY_CLOSED' | 'CLOSED';

export interface StoreMapScheduleInterval {
  open: string;
  close: string;
}

export interface StoreMapSchedule {
  timezone?: string;
  days?: Record<string, StoreMapScheduleInterval[]>;
}

export interface StoreMapPoint {
  id: string;
  externalId: string;
  name: string;
  city: string;
  address: string;
  hoursText: string;
  schedule: StoreMapSchedule;
  publicationStatus: StoreMapPublicationStatus;
  openStatusOverride: StoreMapOpenStatusOverride;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreMapPointInput {
  externalId: string;
  name: string;
  city: string;
  address: string;
  hoursText: string;
  publicationStatus: StoreMapPublicationStatus;
  openStatusOverride: StoreMapOpenStatusOverride;
  latitude: number;
  longitude: number;
}

export interface StoreMapSettings {
  publicId: string;
  title: string;
  markerSvg: string;
  markerWidth: number;
  markerHeight: number;
  markerAnchorX: number;
  markerAnchorY: number;
  centerLatitude: number;
  centerLongitude: number;
  defaultZoom: number;
  updatedAt: string;
}

export interface StoreMapImportRow {
  rowNumber: number;
  externalId: string;
  name: string;
  city: string;
  address: string;
  hoursText: string;
  publicationStatus: StoreMapPublicationStatus;
  latitude: number | null;
  longitude: number | null;
  pointId: string | null;
  action: 'create' | 'update' | 'error' | 'conflict' | 'skipped';
  result: 'ready' | 'created' | 'updated' | 'error' | 'conflict' | 'skipped';
  reason: string;
}

export interface StoreMapImportSummary {
  total: number;
  create?: number;
  update?: number;
  created?: number;
  updated?: number;
  error: number;
  conflict: number;
  skipped: number;
}

export interface StoreMapImportPreview {
  importId?: string;
  rows: StoreMapImportRow[];
  summary: StoreMapImportSummary;
}

export interface PublicStoreMapData {
  settings: StoreMapSettings;
  points: StoreMapPoint[];
  cities: string[];
}

export interface StoreMapPosition {
  latitude: number;
  longitude: number;
}

export interface StoreMapMeasurement extends StoreMapPosition {
  accuracy: number;
  observedAt: string;
  sampleCount: number;
  durationMs: number;
  consistent: boolean;
}

export interface StoreMapRegistrationInput extends StoreMapPosition {
  submissionId?: string;
  name: string;
  city: string;
  address: string;
  hoursText: string;
  comment: string;
  confirmed: true;
  measurement: StoreMapMeasurement;
}

export type StoreMapRequestStatus = 'NEW' | 'APPROVED' | 'REJECTED';

export interface StoreMapRegistrationRequest extends StoreMapPosition {
  id: string;
  linkId: string | null;
  status: StoreMapRequestStatus;
  version: number;
  name: string;
  city: string;
  address: string;
  hoursText: string;
  submittedData: Omit<StoreMapRegistrationInput, 'confirmed' | 'measurement'>;
  measurement: StoreMapMeasurement;
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  pointId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreMapRegistrationLink {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  usedAt: string | null;
}

export interface StoreMapRequestFeed {
  items: StoreMapRegistrationRequest[];
  total: number;
  pendingCount: number;
  page: number;
  pageSize: number;
}

export interface StoreMapRequestReview extends StoreMapPosition {
  version: number;
  name: string;
  city: string;
  address: string;
  hoursText: string;
  reviewNote: string;
}
