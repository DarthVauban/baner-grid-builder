export type ApplicationStatus = 'new' | 'in_progress' | 'rejected' | 'closed';
export type ApplicationFormStatus = 'draft' | 'published' | 'disabled' | 'archived';
export type ApplicationFieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'email' | 'phone' | 'number';
export type ApplicationSystemFieldType = 'first_name' | 'last_name' | 'phone' | 'bank';

export interface ApplicationBank {
  id: string;
  label: string;
  value: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationFieldOption {
  id?: string;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
}

export interface ApplicationFormField {
  id?: string;
  key: string;
  label: string;
  type: ApplicationFieldType;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  required: boolean;
  active: boolean;
  system: boolean;
  systemFieldType: ApplicationSystemFieldType | null;
  showInSummary: boolean;
  sortOrder: number;
  validation: Record<string, unknown>;
  options: ApplicationFieldOption[];
}

export interface ApplicationForm {
  id: string;
  publicId: string;
  name: string;
  title: string;
  description: string;
  buttonText: string;
  successMessage: string;
  status: ApplicationFormStatus;
  settings: Record<string, unknown>;
  styles: Record<string, unknown>;
  fields: ApplicationFormField[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationFormInput {
  name: string;
  title: string;
  description: string;
  buttonText: string;
  successMessage: string;
  settings: Record<string, unknown>;
  styles: Record<string, unknown>;
  fields?: ApplicationFormField[];
}

export interface ApplicationProductSnapshot {
  title: string;
  url: string;
  imageUrl: string;
  imageProxyUrl: string;
  price: string;
  oldPrice: string;
  currency: string;
  sku: string;
  productCode: string;
  availability: string;
  externalProductId: string;
  domain: string;
  rawSafeData: Record<string, unknown>;
  capturedAt: string;
}

export interface ApplicationValue {
  id: string;
  fieldId: string | null;
  key: string;
  label: string;
  type: string;
  systemFieldType: ApplicationSystemFieldType | null;
  showInSummary: boolean;
  value: string;
  optionLabel: string;
  sortOrder: number;
}

export interface ApplicationComment {
  id: string;
  user: { id: string; name: string };
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationHistoryItem {
  id: string;
  previousStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus;
  newStatusLabel: string;
  changedBy: { id: string; name: string } | null;
  comment: string;
  createdAt: string;
}

export interface ApplicationRecord {
  id: string;
  number: string;
  status: ApplicationStatus;
  statusLabel: string;
  formId: string | null;
  formPublicId: string;
  formName: string;
  sourceUrl: string;
  canonicalUrl: string;
  pageTitle: string;
  referrer: string;
  utm: Record<string, string>;
  source: string;
  version: number;
  lastChangedBy: { id: string; name: string } | null;
  assignedManager: { id: string; name: string; assignedAt: string | null } | null;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    bankValue: string;
    bankLabel: string;
  };
  values: ApplicationValue[];
  product: ApplicationProductSnapshot | null;
  history: ApplicationHistoryItem[];
  comments: ApplicationComment[];
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationFeed {
  items: ApplicationRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ApplicationFormSummary {
  id: string;
  publicId: string;
  name: string;
  status: ApplicationFormStatus;
  all: number;
  new: number;
  inProgress: number;
  rejected: number;
  closed: number;
}

export interface ApplicationCounts {
  all: number;
  new: number;
  inProgress: number;
  rejected: number;
  closed: number;
  unassigned: {
    all: number;
    new: number;
    inProgress: number;
    rejected: number;
    closed: number;
  };
  managerStats: Array<{
    manager: { id: string; name: string };
    all: number;
    new: number;
    inProgress: number;
    rejected: number;
    closed: number;
    lastActivityAt: string | null;
  }>;
}

export interface ApplicationButtonConfig {
  id: string;
  name: string;
  formId: string;
  selector: string;
  insertPosition: 'start' | 'end' | 'before' | 'after';
  text: string;
  styles: Record<string, unknown>;
  cssClass: string;
  fullWidth: boolean;
  active: boolean;
  productSelectors: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationButtonInput = Omit<ApplicationButtonConfig, 'id' | 'archivedAt' | 'createdAt' | 'updatedAt'>;
