import { useState, type DragEvent } from 'react';
import { Icon } from '../Icon';
import { blockLabels, effectiveStyle, isContainer, type BlockNode, type Device } from './block-model';
import type { DropPlacement } from './BlockRenderer';

export function BlockTree({ root, selectedId, device, onSelect, onDrop }: { root: BlockNode; selectedId: string; device: Device; onSelect: (id: string) => void; onDrop: (sourceId: string, targetId: string, placement: DropPlacement) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const drop = (event: DragEvent, id: string, placement: DropPlacement) => { event.preventDefault(); event.stopPropagation(); setTarget(''); const source = event.dataTransfer.getData('application/mt-popup-block'); if (source) onDrop(source, id, placement); };
  const over = (event: DragEvent, id: string) => { if (event.dataTransfer.types.includes('application/mt-popup-block')) { event.preventDefault(); event.stopPropagation(); setTarget(id); } };
  function branch(node: BlockNode, depth: number) {
    return <li key={node.id}>
      {node.id !== root.id && <div className={'pb-drop-line ' + (target === node.id + ':before' ? 'is-over' : '')} aria-label={'Вставити перед: ' + node.name} onDragOver={(event) => over(event, node.id + ':before')} onDrop={(event) => drop(event, node.id, 'before')} />}
      <div className={'pb-tree-row ' + (selectedId === node.id ? 'is-active ' : '') + (target === node.id ? 'is-over' : '')} style={{ paddingLeft: 8 + depth * 12 }} data-tree-id={node.id}>
        {isContainer(node) ? <button type="button" className="pb-collapse" aria-label={(collapsed.has(node.id) ? 'Розгорнути: ' : 'Згорнути: ') + node.name} aria-expanded={!collapsed.has(node.id)} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>{collapsed.has(node.id) ? '›' : '⌄'}</button> : <span className="pb-collapse" />}
        <button type="button" className="pb-tree-select" aria-label={'Обрати: ' + node.name} aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} draggable={node.id !== root.id} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('application/mt-popup-block', node.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={(event) => over(event, node.id)} onDrop={(event) => drop(event, node.id, isContainer(node) ? 'inside' : 'after')}>
          <span className="pb-node-glyph">{isContainer(node) ? effectiveStyle(node, device).direction === 'row' ? '↔' : '↕' : node.type === 'text' ? 'T' : node.type === 'button' ? '↗' : node.type === 'image' ? '▧' : '◇'}</span><span>{node.name || blockLabels[node.type]}</span>{effectiveStyle(node, device).hidden && <Icon name="visibility" size={12} />}{node.children.length > 0 && <small>{node.children.length}</small>}
        </button>
      </div>
      {isContainer(node) && !collapsed.has(node.id) && <ul>{node.children.map((child) => branch(child, depth + 1))}{!node.children.length && <li className="pb-tree-empty" onDragOver={(event) => over(event, node.id)} onDrop={(event) => drop(event, node.id, 'inside')}>Порожній контейнер</li>}</ul>}
      {node.id !== root.id && <div className={'pb-drop-line ' + (target === node.id + ':after' ? 'is-over' : '')} aria-label={'Вставити після: ' + node.name} onDragOver={(event) => over(event, node.id + ':after')} onDrop={(event) => drop(event, node.id, 'after')} />}
    </li>;
  }
  return <ul className="pb-tree" aria-label="Дерево блоків" onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(''); }} onDragEnd={() => setTarget('')}>{branch(root, 0)}</ul>;
}
