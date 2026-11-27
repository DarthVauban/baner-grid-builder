export type ProductPreset = 'horizontal' | 'vertical' | 'contrast';
export type ProductStyleValue = string | number | boolean;
export type ProductContent = {productId: string | null; product?: {version: 1; preset: ProductPreset; mobilePreset?: ProductPreset; laptopPreset?: ProductPreset; tabletPreset?: ProductPreset; mobileLandscapePreset?: ProductPreset; base: Record<string, ProductStyleValue>; mobile?: Record<string, ProductStyleValue>; laptop?:Record<string, ProductStyleValue>; tablet?:Record<string, ProductStyleValue>; mobileLandscape?:Record<string, ProductStyleValue>; buttonText?: string; currencyLabel?: string; target?: 'same_tab' | 'new_tab'}};
export type ProductData = {id: string; article: string; name: string; photoUrl: string | null; photoUrls?: string[]; productUrl?: string | null; price: string; availability: 'available' | 'unavailable' | 'unknown'; availabilityLabel: string; updatedAt: number; source?: 'excel' | 'api'};
export type ProductMap = Record<string, ProductData>;
export type ProductImageBinding = {version:1;mode:'main'|'specific';url?:string};
export type ProductPage = {products: ProductData[]; total: number; page: number; pageSize: number};
