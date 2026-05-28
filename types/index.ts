export type ParcelStatus = 'Entrant' | 'Non lié' | 'Lié' | 'En attente' | 'Expédié' | 'Prêt' | 'Livré';
export type SackStatus = 'Ouvert' | 'Fermé' | 'En Transit' | 'Reçu';

export interface Sack {
  id: string;
  barcode: string;
  status: SackStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  actualWeight?: number;
  shipperName?: string;
  talonImageUrl?: string;
  talonReference?: string;
}

export interface ParcelImage {
  type: 'label' | 'scale' | 'opened' | 'general';
  originalUrl: string;
  thumbnailUrl: string;
  uploadedAt: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  username: string;
  role: 'admin' | 'agent' | 'client';
  clientId?: string;
  createdAt: string;
  isDeleted?: boolean;
  updatedAt?: string;
}

export interface Parcel {
  id: string;
  trackingNumber: string;
  status: ParcelStatus;
  weight?: number;
  note?: string;
  internalNote?: string;
  clientId?: string;
  sackId?: string;
  isArchived?: boolean;
  podImageUrl?: string;
  createdAt: string;
  updatedAt: string;
  images?: ParcelImage[];
}

export interface Log {
  id: string;
  parcelId: string;
  userId: string;
  action: string;
  details: string; // JSON string
  timestamp: string;
}
