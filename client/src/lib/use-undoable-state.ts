import { useCallback, useEffect, useReducer, type SetStateAction } from 'react';

interface UndoableStateOptions {
  limit?: number;
  groupWindowMs?: number;
  keyboard?: boolean;
}

interface HistoryState<T> {
  present: T;
  past: T[];
  lastChangeAt: number;
}

type HistoryAction<T> =
  | { type: 'set'; value: SetStateAction<T>; timestamp: number; limit: number; groupWindowMs: number }
  | { type: 'replace'; value: T }
  | { type: 'undo' };

function historyReducer<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
  if (action.type === 'replace') {
    return { present: action.value, past: [], lastChangeAt: 0 };
  }

  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    if (previous === undefined) return state;
    return {
      present: previous,
      past: state.past.slice(0, -1),
      lastChangeAt: 0
    };
  }

  const next = typeof action.value === 'function'
    ? (action.value as (current: T) => T)(state.present)
    : action.value;

  if (Object.is(next, state.present)) return state;

  const continuesCurrentAction = state.lastChangeAt > 0
    && action.timestamp - state.lastChangeAt <= action.groupWindowMs;
  const past = continuesCurrentAction
    ? state.past
    : [...state.past, state.present].slice(-action.limit);

  return {
    present: next,
    past,
    lastChangeAt: action.timestamp
  };
}

export function useUndoableState<T>(
  initialState: T | (() => T),
  { limit = 15, groupWindowMs = 350, keyboard = true }: UndoableStateOptions = {}
) {
  const [history, dispatch] = useReducer(
    historyReducer<T>,
    initialState,
    (value): HistoryState<T> => ({
      present: typeof value === 'function' ? (value as () => T)() : value,
      past: [],
      lastChangeAt: 0
    })
  );

  const setState = useCallback((value: SetStateAction<T>) => {
    dispatch({ type: 'set', value, timestamp: Date.now(), limit, groupWindowMs });
  }, [groupWindowMs, limit]);

  const replaceState = useCallback((value: T) => {
    dispatch({ type: 'replace', value });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
  }, []);

  const canUndo = history.past.length > 0;

  useEffect(() => {
    if (!keyboard) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      const isUndoKey = event.code === 'KeyZ' || event.key.toLowerCase() === 'z';
      if (!(event.ctrlKey || event.metaKey) || !isUndoKey || !canUndo) return;
      event.preventDefault();
      undo();
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [canUndo, keyboard, undo]);

  return {
    state: history.present,
    setState,
    replaceState,
    undo,
    canUndo,
    historyDepth: history.past.length
  };
}
