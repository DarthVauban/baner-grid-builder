export type PlacementAnchor = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type PopupPlacement = { overlay: boolean; anchor: PlacementAnchor; offsetX: number; offsetY: number };
