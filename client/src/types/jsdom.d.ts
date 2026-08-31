declare module 'jsdom' {
  export class VirtualConsole {
    on(event: 'jsdomError', listener: (error: unknown) => void): this;
  }

  export interface JSDOMOptions {
    runScripts?: 'dangerously' | 'outside-only';
    url?: string;
    virtualConsole?: VirtualConsole;
  }

  export class JSDOM {
    constructor(html?: string, options?: JSDOMOptions);
    window: Window & typeof globalThis & { close(): void };
  }
}
