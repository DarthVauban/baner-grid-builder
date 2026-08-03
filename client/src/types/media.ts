export interface MediaAsset {
  id: string;
  folderId: string | null;
  name: string;
  url: string;
  mimeType: 'image/webp';
  size: number;
  originalSize: number;
  width: number;
  height: number;
  altText: string;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetFeed {
  items: MediaAsset[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MediaFolderFeed {
  items: MediaFolder[];
  breadcrumbs: MediaFolder[];
}
