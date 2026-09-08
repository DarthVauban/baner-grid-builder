import type { z } from 'zod';
export const blockTypes: readonly ["container","text","image","button","divider","spacer","coupon","countdown","form","field","product","collection","acknowledgement"];
export type BlockType = typeof blockTypes[number];
export type Device = 'desktop' | 'mobile';
export const blockLabels: Record<BlockType, string>;
export const MAX_BLOCKS: 120;
export const MAX_DEPTH: 12;
export interface BlockStyle {
  direction: "row" | "column";
  wrap: boolean;
  justify: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
  align: "stretch" | "flex-start" | "center" | "flex-end";
  gap: number;
  rowGap: number;
  widthMode: "auto" | "fill" | "fixed" | "percent";
  width: number;
  heightMode: "auto" | "fixed";
  height: number;
  minHeight: number;
  maxWidth: number;
  grow: number;
  shrink: boolean;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  background: string;
  color: string;
  radius: number;
  borderWidth: number;
  borderColor: string;
  borderStyle: "solid" | "dashed" | "dotted";
  shadow: "none" | "soft" | "medium" | "large";
  opacity: number;
  fontSize: number;
  fontWeight: number;
  fontFamily: "inherit" | "Arial, sans-serif" | "Georgia, serif" | "monospace";
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right";
  italic: boolean;
  underline: boolean;
  hidden: boolean;
  overflow: "visible" | "hidden";
}

export interface BlockProps {
  dataSource: 'inherit' | 'page' | 'banner' | 'item';
  collection: import('./campaign-rules.js').CollectionConfig;
  text: string;
  src: string;
  alt: string;
  imageFit: "contain" | "cover";
  imagePosition: "center" | "top" | "bottom" | "left" | "right";
  binding: "none" | "product.title" | "product.variant" | "product.price" | "product.oldPrice" | "product.badge" | "product.image";
  action: "link" | "close" | "copy" | "submit" | "product" | "cart";
  href: string;
  newTab: boolean;
  code: string;
  copyLabel: string;
  timerMode: "duration" | "deadline";
  durationMinutes: number;
  deadlineAt: string;
  hideOnExpire: boolean;
  fieldType: "text" | "email" | "phone" | "textarea" | "select" | "checkbox";
  placeholder: string;
  required: boolean;
  options: string;
  /** On the root: banner product. On product blocks: optional override of the inherited product. */
  productExternalId: string;
  modificationExternalId: string;
  couponSource: "custom" | "campaign";
  reward: "none" | "promo_code";
  productId: "titanium" | "blue" | "pink" | "black";
  successMessage: string;
}

export interface BlockNode { id: string; type: BlockType; name: string; style: BlockStyle; mobile: Partial<BlockStyle>; props: BlockProps; children: BlockNode[] }
export interface BlockDocument { version: 1; name: string; root: BlockNode }
export const styleSchema: z.ZodType<BlockStyle>;
export const propsSchema: z.ZodType<BlockProps>;
export function isContainer(node: BlockNode): boolean;
export function effectiveStyle(node: BlockNode, device: Device): BlockStyle;
export function flatten(root: BlockNode, parent?: BlockNode | null, depth?: number): { node: BlockNode; parent: BlockNode | null; depth: number }[];
export function findBlock(root: BlockNode, id: string): { node: BlockNode; parent: BlockNode | null; depth: number } | undefined;
export function validateDocument(value: unknown): BlockDocument;
