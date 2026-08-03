export interface MediaAsset {
  id: string;
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

export interface MediaAssetFeed {
  items: MediaAsset[];
  total: number;
  page: number;
  pageSize: number;
}
