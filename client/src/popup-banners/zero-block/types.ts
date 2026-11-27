export type Box = { x: number; y: number; width: number; height: number; scale?: number };
export type PopupDevice = 'desktop' | 'laptop' | 'tablet' | 'mobileLandscape' | 'mobile';
export type Corners = { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
export type PopupShadow = { enabled: boolean; x: number; y: number; blur: number; spread: number; color: string };
export type Composition = { width: number; height: number; background: string; corners?: Corners; shadow?: PopupShadow; placement?: import('@zero/placement-types').PopupPlacement };
export type PopupElement = {
  name?: string;
  locked?: boolean;
  id: string; type: 'text' | 'image' | 'button' | 'shape' | 'product' | 'promo' | 'form' | 'field' | 'timer';
  role: 'decorative' | 'link' | 'button'; action: null | { type: string; url?: string; target?: string; formId?: string; promoElementId?: string };
  desktop: Box; mobile: Box | null; mobileStyle: { fontSize: number; radius?: number; corners?: Partial<Corners> } | null;
  laptop?: Box | null; tablet?: Box | null; mobileLandscape?: Box | null;
  laptopStyle?: { fontSize: number; radius?: number; corners?: Partial<Corners> } | null;
  tabletStyle?: { fontSize: number; radius?: number; corners?: Partial<Corners> } | null;
  mobileLandscapeStyle?: { fontSize: number; radius?: number; corners?: Partial<Corners> } | null;
  style: { color: string; background: string; fontSize: number; fontWeight: number; textAlign: 'left' | 'center' | 'right'; radius: number; corners?: Corners; fit: 'contain' | 'cover' };
  content: Record<string, unknown>;
};
/** Two editor compositions; optional former modes remain readable for published-version compatibility. */
export type PopupDocument = {
  schemaVersion: 1; shopId: string; widgetId: string; revision: number; name: string; priority: number; showCloseButton?: boolean;
  timezone?: string;
  desktop: Composition; mobile: Composition; laptop?: Composition; tablet?: Composition; mobileLandscape?: Composition; productId?: string | null;
  elements: PopupElement[]; forms: { id: string; name: string }[];
  groups?: { id: string; name: string; children: string[] }[];
  rules: { schemaVersion: 1; rules: { type: string; [key: string]: unknown }[] };
};
export type Diagnostic = { elementId?: string; code: string; message: string };
export type Widget = {
  widgetId: string;
  shopId: string;
  revision: number;
  campaignRevision: number;
  enabled: boolean;
  document: PopupDocument;
  products: import('@zero/product-types').ProductMap;
  diagnostics: Diagnostic[];
  publishedVersionId: string | null;
  operationVersionId?: string;
  updatedAt: number;
  store: { domain: string; timezone: string } | null;
};

export type ZeroBlockContact = {
  id: string;
  campaignId: string;
  campaignName: string;
  deleted: boolean;
  createdAt: string;
  fields: { label: string; value: string | boolean | string[] }[];
};
