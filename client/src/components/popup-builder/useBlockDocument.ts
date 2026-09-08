import { useEffect, useState } from 'react';
import { validateDocument, type BlockDocument } from './block-model';
import { createTemplate } from './templates';

function restore(key: string) {
  try { const saved = localStorage.getItem(key); if (saved) return { document: validateDocument(JSON.parse(saved)), error: '' }; }
  catch { return { document: createTemplate('promotion'), error: 'Не вдалося відновити макет. Початковий запис залишено в браузері; експортуй новий макет або внеси зміну, щоб зберегти його.' }; }
  return { document: createTemplate('promotion'), error: '' };
}
export function useBlockDocument(key: string, initialDocument?: BlockDocument) {
  const [initial] = useState(() => initialDocument ? { document: validateDocument(initialDocument), error: '' } : restore(key));
  const [history, setHistory] = useState<{ past: BlockDocument[]; present: BlockDocument; future: BlockDocument[] }>({ past: [], present: initial.document, future: [] });
  const [dirty, setDirty] = useState(false);
  const [storageError, setStorageError] = useState(initial.error);
  useEffect(() => {
    if (!dirty || initialDocument) return;
    try { localStorage.setItem(key, JSON.stringify(history.present)); setStorageError(''); }
    catch { setStorageError('Не вдалося зберегти в браузері. Експортуй макет, щоб не втратити зміни.'); }
  }, [key, history.present, dirty, initialDocument]);
  function update(change: (document: BlockDocument) => BlockDocument) {
    const next = validateDocument(change(history.present));
    if (JSON.stringify(next) === JSON.stringify(history.present)) return;
    setHistory((current) => ({ past: [...current.past.slice(-49), current.present], present: next, future: [] }));
    setDirty(true);
  }
  function undo() { setDirty(true); setHistory((current) => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current); }
  function redo() { setDirty(true); setHistory((current) => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current); }
  return { document: history.present, update, undo, redo, canUndo: Boolean(history.past.length), canRedo: Boolean(history.future.length), storageError };
}
