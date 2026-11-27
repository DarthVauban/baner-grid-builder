'use client';
import { useEffect, useRef } from 'react';
import { renderEditorPlaceholder } from './editor-placeholder-dom.mjs';
export { renderEditorPlaceholder } from './editor-placeholder-dom.mjs';

export function EditorPlaceholder({ type }: { type: 'image' | 'product' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) renderEditorPlaceholder(ref.current, type); }, [type]);
  return <div ref={ref} style={{ width: '100%', height: '100%' }}/>;
}
