'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Lock, LockOpen } from 'lucide-react';
import { IconButton } from './components';
import './editor-layer-tree.css';

export type EditorLayerNode = { id: string; label: string; icon: ReactNode; children?: EditorLayerNode[]; locked?: boolean|'mixed'; lockDisabled?: boolean; moveDisabled?: boolean };
type Row = { node: EditorLayerNode; parent: string | null; depth: number };
type Drop = { parent: string | null; index: number; before?: string; after?: string; inside?: string };
type Drag = { id: string; parent: string | null; pointer?: number; label?: boolean; startX: number; startY: number; x: number; y: number; moved: boolean; drop: Drop; snapshot: string };
function rowsOf(nodes: readonly EditorLayerNode[], collapsed = new Set<string>(), parent: string | null = null, depth = 0): Row[] {
  return nodes.flatMap(node => [{ node, parent, depth }, ...(node.children && !collapsed.has(node.id) ? rowsOf(node.children, collapsed, node.id, depth + 1) : [])]);
}
function contains(node: EditorLayerNode, id: string): boolean { return node.id === id || !!node.children?.some(child => contains(child, id)); }
function signature(nodes: readonly EditorLayerNode[]): string { return JSON.stringify(rowsOf(nodes).map(({ node, parent }) => [node.id, parent])); }
function insertion(nodes: readonly EditorLayerNode[], visible: Row[], source: string, parent: string | null, index: number): Drop {
  const siblings = (parent ? rowsOf(nodes).find(row => row.node.id === parent)?.node.children || [] : nodes).filter(node => node.id !== source);
  const at = Math.max(0, Math.min(siblings.length, index)); const previous = siblings[at - 1];
  const after = previous && visible.filter(row => contains(previous, row.node.id)).at(-1)?.node.id;
  return { parent, index: at, before: siblings[at]?.id, after: at === siblings.length ? after : undefined };
}

export function EditorLayerTree({ nodes, selectedIds, onSelect, onMove, onRename, onLockChange, label = 'Порядок шарів' }: {
  nodes: readonly EditorLayerNode[]; selectedIds: readonly string[]; onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, parentId: string | null, index: number) => void; onRename: (id: string, name: string) => void; onLockChange?: (id: string, locked: boolean) => void; label?: string;
}) {
  const root = useRef<HTMLDivElement>(null); const hint = useId(); const [collapsed, setCollapsed] = useState(new Set<string>());
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null); const renameRef = useRef(renaming);
  const [renameError, setRenameError] = useState(''); const [announcement, setAnnouncement] = useState('');
  const [view, setView] = useState<{ id: string; drop: Drop } | null>(null); const drag = useRef<Drag | null>(null);
  const suppressClick = useRef<string | null>(null);
  const latest = useRef({ nodes, onMove, onSelect }); useEffect(() => { latest.current = { nodes, onMove, onSelect }; }, [nodes, onMove, onSelect]);
  const visible = rowsOf(nodes, collapsed); const all = rowsOf(nodes);
  function siblings(parent: string | null) { return parent ? rowsOf(latest.current.nodes).find(row => row.node.id === parent)?.node.children || [] : latest.current.nodes; }
  const finish = useCallback((commit: boolean) => {
    const state = drag.current; if (!state) return; drag.current = null; setView(null);
    if (state.pointer !== undefined && !state.moved) return;
    const valid = state.snapshot === signature(latest.current.nodes);
    if (commit && state.moved && valid) latest.current.onMove(state.id, state.drop.parent, state.drop.index);
    if (commit && valid && state.drop.inside) setCollapsed(current => { const next = new Set(current); next.delete(state.drop.inside!); return next; });
    setAnnouncement(commit && state.moved && valid ? state.drop.inside ? 'Шар додано до групи.' : state.parent && state.drop.parent !== state.parent ? 'Шар винесено з групи.' : 'Порядок шарів оновлено.' : 'Переміщення скасовано.');
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-layer-id="${state.id}"] .ui-editor-layer-grip`)?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    let frame = 0;
    function targetAt(state: Drag) {
      const allRows = rowsOf(latest.current.nodes); const source = allRows.find(row => row.node.id === state.id); if (!source) return;
      const elements = [...root.current?.querySelectorAll<HTMLElement>('[data-layer-id]') || []];
      const hit = elements.find(row => { const rect = row.getBoundingClientRect(); return state.y >= rect.top && state.y <= rect.bottom; });
      const target = allRows.find(row => row.node.id === hit?.dataset.layerId);
      const visibleRows = allRows.filter(row => elements.some(element => element.dataset.layerId === row.node.id));
      function place(parent: string | null, index: number) {
        if (parent && contains(source!.node, parent)) return;
        state.drop = insertion(latest.current.nodes, visibleRows, state.id, parent, index);
        if (parent && parent !== state.parent) state.drop.inside = parent;
        setView({ id: state.id, drop: state.drop });
      }
      const first = elements[0]?.getBoundingClientRect(), last = elements.at(-1)?.getBoundingClientRect();
      // A deliberate horizontal outdent or a blank root slot permits detaching.
      // Starting on a child's indented grip alone must not change its parent.
      const outdent = !!state.parent && state.x < (root.current?.getBoundingClientRect().left || 0) + 28 && state.x < state.startX - 14;
      if (!target && first && last && (state.y < first.top || state.y > last.bottom)) {
        place(null, state.y < first.top ? 0 : latest.current.nodes.filter(node => node.id !== state.id).length); return;
      }
      if (outdent && target) {
        let branch = target; while (branch.parent) branch = allRows.find(row => row.node.id === branch.parent)!;
        const roots = latest.current.nodes.filter(node => node.id !== state.id); const rect = elements.find(row => row.dataset.layerId === branch.node.id)!.getBoundingClientRect();
        place(null, roots.findIndex(node => node.id === branch.node.id) + (state.y < rect.top + rect.height / 2 ? 0 : 1)); return;
      }
      if (target?.node.children && !contains(source.node, target.node.id)) {
        const rect = hit!.getBoundingClientRect(); const ratio = (state.y - rect.top) / rect.height;
        if (ratio >= .25 && ratio <= .75) { state.drop = { parent: target.node.id, index: 0, inside: target.node.id }; setView({ id: state.id, drop: state.drop }); return; }
      }
      // A child row is also a drop target for its containing group. The pointer's
      // half determines its position without moving the group's outside siblings.
      if (target?.parent && target.parent !== state.parent) {
        const parent = allRows.find(row => row.node.id === target.parent)?.node;
        if (parent && !contains(source.node, parent.id)) {
          const rect = hit!.getBoundingClientRect(); const before = state.y < rect.top + rect.height / 2;
          const children = parent.children!.filter(node => node.id !== state.id);
          const index = children.findIndex(node => node.id === target.node.id) + (before ? 0 : 1);
          state.drop = { parent: parent.id, index, inside: parent.id, before: before ? target.node.id : undefined, after: before ? undefined : target.node.id };
          setView({ id: state.id, drop: state.drop }); return;
        }
      }
      if (target && target.node.id !== state.id && !contains(source.node, target.node.id)) {
        const list = target.parent ? allRows.find(row => row.node.id === target.parent)!.node.children! : latest.current.nodes;
        const remaining = list.filter(node => node.id !== state.id); const rect = hit!.getBoundingClientRect();
        place(target.parent, remaining.findIndex(node => node.id === target.node.id) + (state.y < rect.top + rect.height / 2 ? 0 : 1)); return;
      }
      const remaining = elements.filter(row => allRows.some(item => item.node.id === row.dataset.layerId && item.parent === state.parent && item.node.id !== state.id));
      const index = remaining.findIndex(row => { const rect = row.getBoundingClientRect(); return state.y < rect.top + rect.height / 2; });
      const at = index < 0 ? remaining.length : index;
      state.drop = { parent: state.parent, index: at, before: remaining[at]?.dataset.layerId, after: at === remaining.length ? remaining.at(-1)?.dataset.layerId : undefined }; setView({ id: state.id, drop: state.drop });
    }
    function scroll() {
      const state = drag.current; const host = root.current; if (!state || !host || state.pointer === undefined) return;
      const rect = host.getBoundingClientRect(); const amount = state.y < rect.top + 28 ? -8 : state.y > rect.bottom - 28 ? 8 : 0;
      if (amount) { host.scrollTop += amount; targetAt(state); } frame = requestAnimationFrame(scroll);
    }
    function move(event: PointerEvent) {
      const state = drag.current; if (!state || state.pointer !== event.pointerId) return;
      state.x = event.clientX; state.y = event.clientY; if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 4) return;
      event.preventDefault();
      if (!state.moved && state.label) { suppressClick.current = state.id; latest.current.onSelect(state.id, false); }
      state.moved = true; targetAt(state); if (!frame) frame = requestAnimationFrame(scroll);
    }
    function up(event: PointerEvent) { if (drag.current?.pointer !== event.pointerId) return; finish(event.type === 'pointerup'); cancelAnimationFrame(frame); frame = 0; }
    function escape(event: globalThis.KeyboardEvent) { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); finish(false); cancelAnimationFrame(frame); frame = 0; } }
    function blur() { finish(false); cancelAnimationFrame(frame); frame = 0; }
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('keydown', escape, true); window.addEventListener('blur', blur);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', blur); };
  }, [finish]);
  function pointer(row: Row, event: ReactPointerEvent<HTMLButtonElement>, label = false) {
    suppressClick.current = null;
    if (row.node.moveDisabled || event.button !== 0 || drag.current || all.length < 2 || (label && (event.ctrlKey || event.metaKey || event.pointerType === 'touch'))) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    const index = siblings(row.parent).findIndex(node => node.id === row.node.id);
    drag.current = { id: row.node.id, parent: row.parent, pointer: event.pointerId, label, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false, drop: { parent: row.parent, index }, snapshot: signature(nodes) };
    if (!label) onSelect(row.node.id, false);
  }
  function keyboard(row: Row, event: KeyboardEvent<HTMLButtonElement>) {
    if(row.node.moveDisabled)return;
    const state = drag.current;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); if (state) { finish(true); return; }
      const list = siblings(row.parent); const index = list.findIndex(node => node.id === row.node.id);
      drag.current = { id: row.node.id, parent: row.parent, startX: 0, startY: 0, x: 0, y: 0, moved: false, drop: { parent: row.parent, index }, snapshot: signature(nodes) };
      onSelect(row.node.id, false); setView({ id: row.node.id, drop: drag.current.drop }); setAnnouncement('Шар піднято. Стрілки змінюють позицію, вправо додає до групи, вліво виносить із групи, пробіл підтверджує.'); return;
    }
    if (!state || state.id !== row.node.id || state.pointer !== undefined) return;
    const remaining = siblings(state.drop.parent).filter(node => node.id !== state.id);
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? remaining.length : Math.max(0, Math.min(remaining.length, state.drop.index + (event.key === 'ArrowDown' ? 1 : -1)));
      state.drop = insertion(nodes, visible, state.id, state.drop.parent, index); state.moved = true;
      if (state.drop.parent && state.drop.parent !== state.parent) state.drop.inside = state.drop.parent;
    } else if (event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation(); const group = [remaining[state.drop.index], remaining[state.drop.index - 1]].find(node => node?.children);
      if (group) { state.drop = { parent: group.id, index: 0, inside: group.id }; state.moved = true; }
    } else if (event.key === 'ArrowLeft' && state.drop.parent) {
      event.preventDefault(); event.stopPropagation(); const parent = all.find(item => item.node.id === state.drop.parent)!;
      const list = siblings(parent.parent).filter(node => node.id !== state.id);
      state.drop = insertion(nodes, visible, state.id, parent.parent, list.findIndex(node => node.id === parent.node.id) + 1); state.moved = true;
    } else return;
    setView({ id: state.id, drop: state.drop }); setAnnouncement(state.drop.inside ? 'Додати до групи. Пробіл підтверджує.' : `Позиція ${state.drop.index + 1}. Пробіл підтверджує.`);
  }
  function startRename(node: EditorLayerNode) { const next = { id: node.id, value: node.label }; renameRef.current = next; setRenaming(next); setRenameError(''); }
  function finishRename(commit: boolean, returnFocus = true) {
    const state = renameRef.current; if (!state) return;
    const value = state.value.trim(); if (commit && !value) { setRenameError('Вкажіть назву шару'); return; }
    renameRef.current = null; setRenaming(null); setRenameError(''); if (commit) onRename(state.id, value);
    if (returnFocus) requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-layer-id="${state.id}"] .ui-editor-layer-select`)?.focus({ preventScroll: true }));
  }
  return <div ref={root} className="ui-editor-layer-list ui-editor-layer-tree" role="tree" aria-label={label} aria-multiselectable="true">
    <p id={hint} className="ui-sr-only">Ctrl та клік — множинний вибір. F2 або подвійний клік — назва. Перетягніть назву або ручку на групу для додавання; на кореневий рядок, лівий відступ або порожній низ — для виходу. Пробіл, стрілки й пробіл — перестановка; вліво виносить із групи. Escape скасовує.</p>
    {visible.map(row => { const { node, parent, depth } = row; const selected = selectedIds.includes(node.id); const drop = view?.drop;
      return <div key={node.id} className="ui-editor-layer-position" data-layer-id={node.id} data-parent-id={parent || ''} data-dragging={view?.id === node.id || undefined} data-drop={drop?.inside === node.id ? 'inside' : drop?.before === node.id ? 'before' : drop?.after === node.id ? 'after' : undefined} role="treeitem" aria-level={depth + 1} aria-expanded={node.children ? !collapsed.has(node.id) : undefined} aria-selected={selected} onContextMenu={() => { if (!selected) onSelect(node.id, false); }} style={{ paddingLeft: depth * 14 }}>
        <div className="ui-editor-layer" data-selected={selected || undefined}>
          <button type="button" className="ui-editor-layer-grip" aria-label={`Перемістити шар: ${node.label}`} aria-describedby={hint} aria-pressed={view?.id === node.id} disabled={all.length < 2 || node.moveDisabled} onKeyDown={event => keyboard(row, event)} onPointerDown={event => pointer(row, event)}><GripVertical size={15}/></button>
          {node.children ? <button className="ui-editor-layer-collapse" type="button" aria-label={`${collapsed.has(node.id) ? 'Розкрити' : 'Згорнути'} групу: ${node.label}`} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>{collapsed.has(node.id) ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button> : null}
          {renaming?.id === node.id ? <input className="ui-editor-layer-rename" aria-label="Назва шару" aria-invalid={!!renameError} title={renameError || undefined} maxLength={100} value={renaming.value} ref={input => { if (input && document.activeElement !== input) { input.focus(); input.select(); } }} onChange={event => { const next = { id: node.id, value: event.target.value }; renameRef.current = next; setRenaming(next); setRenameError(''); }} onBlur={() => finishRename(true, false)} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishRename(event.key === 'Enter'); } }}/> : <button type="button" className="ui-editor-layer-select" aria-pressed={selected} onPointerDown={event => pointer(row, event, true)} onClick={event => { if (suppressClick.current === node.id) { suppressClick.current = null; event.preventDefault(); return; } onSelect(node.id, event.ctrlKey || event.metaKey); }} onDoubleClick={() => startRename(node)} onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); startRename(node); } }}><span aria-hidden="true">{node.icon}</span><span>{node.label}</span></button>}
          {onLockChange&&node.locked!==undefined?<IconButton className="ui-editor-layer-lock" size="sm" variant="ghost" label={`${node.locked===true?'Розблокувати':'Заблокувати'} ${node.children?'групу':'шар'}: ${node.label}`} aria-pressed={node.locked} aria-description={node.locked==='mixed'?'Частково заблоковано':undefined} icon={node.locked===false?<LockOpen size={16}/>:<Lock size={16}/>} disabled={node.lockDisabled||!!view} onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>{if(!event.ctrlKey&&!event.metaKey)event.stopPropagation();}} onClick={event=>{event.stopPropagation();onLockChange(node.id,node.locked!==true);}}/>:null}
        </div>
      </div>;
    })}
    <span className="ui-sr-only" role="status">{renameError || announcement}</span>
  </div>;
}
