import { useEffect, useState } from 'react';
import { readDraft, type PrototypeDraft, type PrototypeKind } from './model';

export function usePrototypeDraft(key: string, kind: PrototypeKind) {
  const [history, setHistory] = useState<{ past: PrototypeDraft[]; present: PrototypeDraft; future: PrototypeDraft[] }>(() => ({ past: [], present: readDraft(key, kind), future: [] }));
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, draft: history.present }));
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [history.present, key]);

  function update(change: (draft: PrototypeDraft) => PrototypeDraft) {
    setHistory((current) => {
      const next = change(current.present);
      if (JSON.stringify(next) === JSON.stringify(current.present)) return current;
      return { past: [...current.past.slice(-49), current.present], present: next, future: [] };
    });
  }
  function undo() {
    setHistory((current) => current.past.length ? {
      past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future]
    } : current);
  }
  function redo() {
    setHistory((current) => current.future.length ? {
      past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1)
    } : current);
  }
  return { draft: history.present, update, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0, storageError };
}
