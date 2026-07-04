export type PublicationStatus = 'planned' | 'ready' | 'published' | 'cancelled';
export type PublicationMaterialType = 'google_doc' | 'drive_folder' | 'drive_file' | 'image' | 'link';

export interface PublicationMaterial {
  id?: string;
  type: PublicationMaterialType;
  label: string;
  url: string;
}

export interface PublicationPerson {
  id: string;
  name: string;
  email: string;
}

export interface BlogPublication {
  id: string;
  title: string;
  description: string;
  status: PublicationStatus;
  publishAt: string;
  publicationUrl: string;
  creator: PublicationPerson;
  assignee: PublicationPerson | null;
  materials: PublicationMaterial[];
  publishedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicationInput {
  title: string;
  description: string;
  publishAt: string;
  assigneeId: string | null;
  materials: PublicationMaterial[];
}

export interface PublicationCounts {
  active: number;
  today: number;
  upcoming: number;
  ready: number;
  overdue: number;
}
