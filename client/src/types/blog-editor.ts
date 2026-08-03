export type BlogSectionTone = 'default' | 'soft';
export type BlogCardColumns = 2 | 3;

export interface BlogHero {
  kicker: string;
  title: string;
  lead: string;
  imageUrl: string;
  imageAlt: string;
  meta: string[];
}

export interface BlogParagraphBlock {
  id: string;
  type: 'paragraph';
  text: string;
}

export interface BlogSubheadingBlock {
  id: string;
  type: 'subheading';
  text: string;
}

export interface BlogImageBlock {
  id: string;
  type: 'image';
  url: string;
  alt: string;
  caption: string;
}

export interface BlogListBlock {
  id: string;
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface BlogTableBlock {
  id: string;
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface BlogCardItem {
  title: string;
  text: string;
  linkLabel: string;
  linkUrl: string;
}

export interface BlogCardsBlock {
  id: string;
  type: 'cards';
  columns: BlogCardColumns;
  items: BlogCardItem[];
}

export interface BlogCalloutBlock {
  id: string;
  type: 'callout';
  title: string;
  text: string;
}

export interface BlogFaqItem {
  question: string;
  answer: string;
}

export interface BlogFaqBlock {
  id: string;
  type: 'faq';
  items: BlogFaqItem[];
}

export interface BlogCtaBlock {
  id: string;
  type: 'cta';
  title: string;
  text: string;
  buttonLabel: string;
  buttonUrl: string;
}

export type BlogContentBlock =
  | BlogParagraphBlock
  | BlogSubheadingBlock
  | BlogImageBlock
  | BlogListBlock
  | BlogTableBlock
  | BlogCardsBlock
  | BlogCalloutBlock
  | BlogFaqBlock
  | BlogCtaBlock;

export interface BlogPostSection {
  id: string;
  title: string;
  tone: BlogSectionTone;
  blocks: BlogContentBlock[];
}

export interface BlogPostDocument {
  version: 1;
  slug: string;
  sharePreview: string;
  hero: BlogHero;
  sections: BlogPostSection[];
  customCss: string;
  customJs: string;
}

export interface BlogPostExport {
  html: string;
  css: string;
  js: string;
  combined: string;
  preview: string;
}
