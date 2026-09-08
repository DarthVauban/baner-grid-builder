import type { z } from 'zod';
export type RuleField = 'page' | 'stock' | 'product' | 'sku' | 'category' | 'brand' | 'sticker' | 'condition' | 'url' | 'path';
export interface RuleCondition { kind: 'condition'; field: RuleField; operator: 'is' | 'is_not' | 'contains'; values: string[]; descendants: boolean }
export interface RuleGroup { kind: 'group'; match: 'all' | 'any'; children: (RuleCondition | RuleGroup)[] }
export interface CollectionConfig {
  source: 'category' | 'parent_category' | 'selected_category' | 'manual'; categoryId: string; descendants: boolean;
  items: { productExternalId: string; modificationExternalId: string | null }[];
  excludeCurrent: boolean; excludedCategories: string[]; excludedBrands: string[]; brands: string[]; conditions: string[]; excludedProducts: string[];
  minPrice: number | null; maxPrice: number | null; sort: 'nearest_price' | 'popular' | 'price_asc' | 'price_desc';
  limit: number; minimum: number; desktopColumns: number; mobileColumns: number; layout: 'grid' | 'carousel';
}
export const collectionSchema: z.ZodType<CollectionConfig>;
export const ruleGroupSchema: z.ZodType<RuleGroup>;
export const ruleFields: RuleField[];
export interface CategoryOption { id: string; parentId?: string; title: string; path?: string }
export interface RuleTrace { path: string; field: RuleField; operator: RuleCondition['operator']; expected: string[]; actual: string | string[] | null; result: boolean | null }
export interface RuleContext { product: { externalId: string; sku: string; categoryId: string; brand: string; condition: string; stickers: { id: string; title: string }[] } | null; stockState: string; categories?: CategoryOption[]; pageUrl: string }
export function categoryAncestors(id: string, categories: CategoryOption[]): string[];
export function evaluateRules(root: RuleGroup, context: RuleContext): { result: boolean | null; traces: RuleTrace[] };
export function evaluateAudience(targeting: { rules?: RuleGroup; exclusions?: RuleGroup }, context: RuleContext): { eligible: boolean; include: ReturnType<typeof evaluateRules>; exclude: ReturnType<typeof evaluateRules> };
