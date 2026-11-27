'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { copyLayers, parseLayers, pasteLayers, serializeLayers } from '@zero/clipboard.mjs';
import type { PopupDocument } from './types';

type Options = {
  documentRef: RefObject<PopupDocument | null>; selectionRef: RefObject<string[]>;
  surfaceRef: RefObject<HTMLElement | null>; blocked: () => boolean;
  onPaste: (document: PopupDocument, ids: string[]) => void; onMessage: (message: string) => void;
};

export function useLayerClipboard(options: Options) {
  const cache = useRef<{ text: string; count: number } | null>(null);
  // Clipboard API promises can complete after a render or a route transition.
  const live = useRef(options); useEffect(() => { live.current = options; });
  const actions = useRef({
    snapshot() {
      const { documentRef, selectionRef, blocked } = live.current;
      if (blocked() || !documentRef.current) return null;
      const fragment = copyLayers(documentRef.current, selectionRef.current) as PopupDocument | null;
      if (!fragment) return null;
      const text = serializeLayers(fragment); cache.current = { text, count: 0 };
      return text;
    },
    insert(text: string) {
      const { documentRef, blocked, onPaste, onMessage } = live.current;
      if (blocked() || !documentRef.current) return false;
      try {
        const fragment = parseLayers(text, documentRef.current.shopId) as PopupDocument;
        const count = (cache.current?.text === text ? cache.current.count : 0) + 1;
        const result = pasteLayers(documentRef.current, fragment, count * 20) as { document: PopupDocument; ids: string[] };
        onPaste(result.document, result.ids);
        cache.current = { text, count }; return true;
      } catch (error) { onMessage(error instanceof Error ? error.message : 'Не вдалося вставити шари'); return false; }
    },
    async copy() {
      const text = actions.current.snapshot(); if (!text) return;
      try { await navigator.clipboard.writeText(text); }
      catch { live.current.onMessage('Скопійовано в буфер редактора. Ctrl+C також копіює в системний буфер.'); }
    },
    async paste() {
      const before = live.current.documentRef.current; if (!before || live.current.blocked()) return;
      let text: string, fallback = false;
      try { text = await navigator.clipboard.readText(); }
      catch {
        if (!cache.current) { live.current.onMessage('Браузер не надав доступ до буфера. Скористайтеся Ctrl+V.'); return; }
        text = cache.current.text; fallback = true;
      }
      const current = live.current.documentRef.current;
      if (!current || current.widgetId !== before.widgetId || current.shopId !== before.shopId) return;
      if (actions.current.insert(text) && fallback) live.current.onMessage('Використано буфер редактора: браузер не надав доступ до системного буфера.');
    },
  });
  useEffect(() => {
    const allowed = (event: ClipboardEvent) => {
      const { surfaceRef, blocked } = live.current;
      const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
      return !event.defaultPrevented && !blocked() && path.includes(surfaceRef.current!) && !path.some(node => node.isContentEditable || node.matches('input,textarea,select,[role=textbox],[role=combobox],[role=menu],[role=dialog],[role=alertdialog]'));
    };
    const copy = (event: ClipboardEvent) => {
      if (!allowed(event) || !event.clipboardData) return;
      const text = actions.current.snapshot(); if (!text) return;
      event.clipboardData.setData('text/plain', text); event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      if (!allowed(event) || !event.clipboardData) return;
      event.preventDefault(); actions.current.insert(event.clipboardData.getData('text/plain'));
    };
    window.addEventListener('copy', copy); window.addEventListener('paste', paste);
    return () => { window.removeEventListener('copy', copy); window.removeEventListener('paste', paste); };
  }, []);
  return { copy: () => actions.current.copy(), paste: () => actions.current.paste() };
}
