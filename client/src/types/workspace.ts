export interface OwnerSummary {
  id: string;
  name: string;
}

export interface BannerData {
  title: string;
  endDate: string;
  endTime: string;
  imageUrl: string;
  targetUrl: string;
  disableWhenExpired: boolean;
}

export interface BannerDraft extends BannerData {
  localId: string;
  savedBannerId?: string;
}

export interface SavedGrid {
  id: string;
  name: string;
  shareDescription: string;
  banners: BannerData[];
  owner: OwnerSummary | null;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedBanner {
  id: string;
  name: string;
  banner: BannerData;
  owner: OwnerSummary | null;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductTableRow {
  sourceIndex: number;
  values: string[];
  completed: boolean;
  uploaded: boolean;
}

export interface ProductTableSheet {
  name: string;
  headers: string[];
  showCompletedStatus: boolean;
  showUploadedStatus: boolean;
  rows: ProductTableRow[];
}

export interface ProductTableData {
  activeSheet: string;
  sheets: ProductTableSheet[];
}

export interface ProductTableRecord {
  id: string;
  name: string;
  fileName: string;
  data?: ProductTableData;
  sheetCount: number;
  rowCount: number;
  owner: OwnerSummary | null;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductTableInput {
  name: string;
  fileName: string;
  data: ProductTableData;
}
