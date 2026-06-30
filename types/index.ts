export type ParcelStatus = 'Entrant' | 'En attente' | 'Expédié' | 'Prêt' | 'Livré' | 'En Transit';
export type SackStatus = 'Ouvert' | 'Fermé' | 'En Transit' | 'Reçu';

export interface Sack {
  id: string;
  barcode: string;
  status: SackStatus;
  location?: 'china' | 'madagascar';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  actualWeight?: number;
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
  agentLocation?: 'china' | 'madagascar';
  clientId?: string;
  createdAt: string;
  isDeleted?: boolean;
  updatedAt?: string;
}

export interface Parcel {
  id: string;
  trackingNumber: string;
  status: ParcelStatus;
  location?: 'china' | 'madagascar';
  linked?: boolean;
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
