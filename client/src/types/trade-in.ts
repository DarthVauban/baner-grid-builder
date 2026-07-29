export type TradeInFieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'email' | 'phone' | 'number';
export type TradeInConditionOperator = 'equals' | 'not_equals' | 'one_of' | 'contains' | 'answered';
export type TradeInSystemFieldType = 'first_name' | 'last_name' | 'phone' | null;
export type TradeInAnswer = string | string[] | boolean;
export type TradeInAnswers = Record<string, TradeInAnswer>;

export interface TradeInCondition {
  fieldKey: string;
  operator: TradeInConditionOperator;
  value: string;
}

export interface TradeInOption {
  id: string;
  label: string;
  value: string;
}

export interface TradeInField {
  id: string;
  key: string;
  label: string;
  type: TradeInFieldType;
  placeholder: string;
  helpText: string;
  required: boolean;
  width: 'full' | 'half';
  showInSummary: boolean;
  systemFieldType: TradeInSystemFieldType;
  min?: number | null;
  max?: number | null;
  condition: TradeInCondition;
  options: TradeInOption[];
}

export interface TradeInStep {
  id: string;
  title: string;
  description: string;
  showInApplicationSummary?: boolean;
  condition: TradeInCondition;
  fields: TradeInField[];
}

export type TradeInFormNodeType = 'start' | 'fields' | 'condition' | 'information' | 'finish';

export interface TradeInFormNodePosition {
  x: number;
  y: number;
}

export interface TradeInConditionBranch {
  id: string;
  label: string;
  condition: TradeInCondition;
}

export interface TradeInFormNode {
  id: string;
  type: TradeInFormNodeType;
  position: TradeInFormNodePosition;
  title: string;
  description: string;
  showInApplicationSummary: boolean;
  fields: TradeInField[];
  branches: TradeInConditionBranch[];
  defaultBranchLabel: string;
}

export interface TradeInFormEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
}

export interface TradeInFormGraph {
  nodes: TradeInFormNode[];
  edges: TradeInFormEdge[];
}

export interface TradeInContentItem {
  id: string;
  title: string;
  text: string;
}

export interface TradeInStatItem {
  id: string;
  value: string;
  label: string;
}

export interface TradeInFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface TradeInConfig {
  version: number;
  formReference: {
    formId: string;
    formName: string;
  };
  theme: {
    fontFamily: string;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;
    mutedColor: string;
    primaryColor: string;
    primaryTextColor: string;
    borderColor: string;
    successColor: string;
    maxWidth: number;
    borderRadius: number;
    buttonRadius: number;
    sectionSpacing: number;
  };
  header: {
    visible: boolean;
    sticky: boolean;
    brandName: string;
    sectionLabel: string;
    ctaLabel: string;
  };
  hero: {
    visible: boolean;
    eyebrow: string;
    title: string;
    description: string;
    primaryActionLabel: string;
    secondaryText: string;
    badge: string;
  };
  stats: { visible: boolean; items: TradeInStatItem[] };
  process: {
    visible: boolean;
    eyebrow: string;
    title: string;
    description: string;
    items: TradeInContentItem[];
  };
  benefits: {
    visible: boolean;
    eyebrow: string;
    title: string;
    items: TradeInContentItem[];
  };
  faq: {
    visible: boolean;
    eyebrow: string;
    title: string;
    items: TradeInFaqItem[];
  };
  contact: {
    visible: boolean;
    eyebrow: string;
    title: string;
    description: string;
    buttonLabel: string;
  };
  footer: {
    visible: boolean;
    companyName: string;
    description: string;
    phone: string;
    email: string;
    legalText: string;
  };
  seo: {
    title: string;
    description: string;
    robots: string;
  };
  form: {
    title: string;
    description: string;
    showProgress: boolean;
    showStepNumbers: boolean;
    showSummary: boolean;
    backLabel: string;
    nextLabel: string;
    submitLabel: string;
    successTitle: string;
    successText: string;
    graph?: TradeInFormGraph;
    /** @deprecated Kept for automatic conversion of saved version 1 forms. */
    steps: TradeInStep[];
  };
}

export interface TradeInSettings {
  publicId: string;
  status: 'draft' | 'published';
  publicOrigin: string;
  draftConfig: TradeInConfig;
  publishedConfig: TradeInConfig | null;
  updatedAt: string | null;
  publishedAt: string | null;
}

export interface PublicTradeInSettings {
  config: TradeInConfig;
  publishedAt?: string | null;
  preview?: boolean;
}
