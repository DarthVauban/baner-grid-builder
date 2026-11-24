export function promoBarBackgroundImage(value: string, origin?: string): string;
export function mountPromoBarMarquee(viewport: HTMLElement, message: HTMLElement, speed: number): (() => void) | undefined;
export function mountPromoBarGoldGlint(bar: HTMLElement, config: {
  color: string;
  intensity: number;
  durationMs: number;
  repeat: 'once' | 'interval';
  intervalSeconds: number;
}, preview?: boolean): (() => void) | undefined;
