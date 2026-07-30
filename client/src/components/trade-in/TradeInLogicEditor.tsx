import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStoreApi,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnConnectEnd
} from '@xyflow/react';
import { Icon, type IconName } from '../Icon';
import {
  canConnectTradeInGraph,
  connectTradeInGraph,
  createTradeInFormNode,
  findNearestFreeNodePosition,
  formatTradeInConditionBranch,
  getTradeInFormGraph,
  getTradeInGraphFieldEntries,
  getTradeInGraphFields,
  removeTradeInGraphNode,
  tradeInConditionOperatorLabels,
  validateTradeInLogic,
  type TradeInLogicIssue
} from '../../lib/trade-in-logic';
import {
  createTradeInConditionGroup,
  createTradeInField,
  createTradeInOption,
  emptyTradeInCondition,
  moveTradeInItem,
  tradeInConditionGroup,
  transliterateTradeInFieldKey,
  uniqueTradeInFieldKey,
  tradeInId
} from '../../lib/trade-in';
import type {
  TradeInCondition,
  TradeInConditionOperator,
  TradeInConfig,
  TradeInField,
  TradeInFieldType,
  TradeInFormEdge,
  TradeInFormGraph,
  TradeInFormNode,
  TradeInFormNodePosition,
  TradeInFormNodeType
} from '../../types/trade-in';
import '@xyflow/react/dist/style.css';
import '../../styles/trade-in-logic-editor.css';

type GraphNodeData = {
  node: TradeInFormNode;
  issues: TradeInLogicIssue[];
  conditionLabels: Record<string, string>;
};

type GraphNode = Node<GraphNodeData, TradeInFormNodeType>;
type GraphEdge = Edge;
type AddableNodeType = Exclude<TradeInFormNodeType, 'start'>;
type PendingConnection = {
  source: string;
  sourceHandle: string;
};
type NodePaletteState = {
  x: number;
  y: number;
  position: TradeInFormNodePosition;
  pendingConnection?: PendingConnection;
  lineStart?: { x: number; y: number };
};

const nodeTypes = {
  start: TradeInGraphNode,
  fields: TradeInGraphNode,
  condition: TradeInGraphNode,
  information: TradeInGraphNode,
  finish: TradeInGraphNode
};

const typeMeta: Record<TradeInFormNodeType, { label: string; description: string; icon: IconName }> = {
  start: { label: 'Початок', description: 'Старт сценарію', icon: 'arrowRight' },
  fields: { label: 'Крок з полями', description: 'Запитання та введення даних', icon: 'formBuilder' },
  condition: { label: 'Умова', description: 'Розгалуження за відповіддю', icon: 'variants' },
  information: { label: 'Інформація', description: 'Текст без введення даних', icon: 'blogPublications' },
  finish: { label: 'Завершення', description: 'Відправлення заявки', icon: 'check' }
};

const addableTypes: AddableNodeType[] = ['fields', 'condition', 'information', 'finish'];
const operatorOptions = Object.entries(tradeInConditionOperatorLabels) as Array<[TradeInConditionOperator, string]>;
type GraphFieldEntry = ReturnType<typeof getTradeInGraphFieldEntries>[number];

function conditionOperatorOptions(field?: TradeInField) {
  if (!field) return operatorOptions;
  const common: TradeInConditionOperator[] = ['equals', 'not_equals', 'answered', 'not_answered'];
  if (field.type === 'number') {
    return operatorOptions.filter(([operator]) => [
      ...common,
      'greater_than',
      'greater_or_equal',
      'less_than',
      'less_or_equal'
    ].includes(operator));
  }
  if (field.type === 'checkbox') {
    return operatorOptions.filter(([operator]) => [...common, 'one_of', 'contains'].includes(operator));
  }
  if (field.options.length) {
    return operatorOptions.filter(([operator]) => [...common, 'one_of'].includes(operator));
  }
  return operatorOptions.filter(([operator]) => [...common, 'contains'].includes(operator));
}

function conditionNeedsValue(operator: TradeInConditionOperator) {
  return operator !== 'answered' && operator !== 'not_answered';
}

function TradeInGraphNode({ data, selected }: NodeProps<GraphNode>) {
  const { node, issues } = data;
  const updateNodeInternals = useUpdateNodeInternals();
  const meta = typeMeta[node.type];
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const handleCount = node.type === 'condition' ? node.branches.length + 1 : 1;
  const minHeight = node.type === 'condition' ? Math.max(164, 112 + handleCount * 32) : 164;

  useEffect(() => {
    updateNodeInternals(node.id);
  }, [node.branches.length, node.id, updateNodeInternals]);

  return (
    <article
      className={`trade-in-graph-node trade-in-graph-node--${node.type}${selected ? ' is-selected' : ''}${errors ? ' has-error' : ''}`}
      style={{ minHeight }}
    >
      {node.type !== 'start' && <Handle type="target" position={Position.Left} />}
      <header>
        <span><Icon name={meta.icon} size={17} /></span>
        <div>
          <small>{meta.label}</small>
          <strong>{node.title || meta.label}</strong>
        </div>
        {issues.length > 0 && <i className={errors ? 'is-error' : 'is-warning'}>{issues.length}</i>}
      </header>
      <p>{node.description || meta.description}</p>

      {node.type === 'fields' && (
        <div className="trade-in-graph-node__chips">
          {node.fields.slice(0, 3).map((field) => <span key={field.id}>{field.label || field.key || 'Поле'}</span>)}
          {node.fields.length > 3 && <span>+{node.fields.length - 3}</span>}
          {!node.fields.length && <span className="is-empty">Немає полів</span>}
        </div>
      )}

      {node.type === 'condition' && (
        <div className="trade-in-graph-node__branches">
          {node.branches.map((branch) => (
            <div key={branch.id}>
              <span>{branch.label || 'Гілка'}</span>
              <small>{data.conditionLabels[branch.id]}</small>
            </div>
          ))}
          <div><span>{node.defaultBranchLabel || 'Інші випадки'}</span><small>Резервна гілка</small></div>
        </div>
      )}

      {node.type === 'finish' && <div className="trade-in-graph-node__finish"><Icon name="send" size={14} /> Заявка менеджеру</div>}

      {node.type !== 'finish' && node.type !== 'condition' && (
        <Handle id="next" type="source" position={Position.Right} />
      )}
      {node.type === 'condition' && (
        <>
          {node.branches.map((branch, index) => (
            <Handle
              id={branch.id}
              type="source"
              position={Position.Right}
              style={{ top: 116 + index * 32 } as CSSProperties}
              key={branch.id}
            />
          ))}
          <Handle
            id="default"
            type="source"
            position={Position.Right}
            style={{ top: 116 + node.branches.length * 32 } as CSSProperties}
          />
        </>
      )}
    </article>
  );
}

function InputField({
  label,
  value,
  onChange,
  textarea = false,
  type = 'text',
  children
}: {
  label: string;
  value?: string | number;
  onChange?: (value: string) => void;
  textarea?: boolean;
  type?: string;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || (textarea
        ? <textarea value={value ?? ''} onChange={(event) => onChange?.(event.target.value)} />
        : <input type={type} value={value ?? ''} onChange={(event) => onChange?.(event.target.value)} />)}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="trade-in-graph-toggle">
      <span>{label}</span>
      <span className="trade-in-graph-toggle__switch">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <i aria-hidden="true" />
      </span>
    </label>
  );
}

function FieldConditionEditor({
  condition,
  fields,
  onChange
}: {
  condition: TradeInCondition;
  fields: TradeInField[];
  onChange: (condition: TradeInCondition) => void;
}) {
  const selectedField = fields.find((field) => field.key === condition.fieldKey);
  return (
    <details className="trade-in-graph-field-condition">
      <summary>Додаткова умова видимості поля <i>⌄</i></summary>
      <div>
        <InputField label="Поле">
          <select value={condition.fieldKey} onChange={(event) => onChange({ ...condition, fieldKey: event.target.value })}>
            <option value="">Завжди показувати</option>
            {fields.filter((field) => field.key).map((field) => <option value={field.key} key={field.id}>{field.label} ({field.key})</option>)}
          </select>
        </InputField>
        {condition.fieldKey && (
          <>
            <InputField label="Перевірка">
              <select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as TradeInConditionOperator })}>
                {conditionOperatorOptions(selectedField).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </InputField>
            {conditionNeedsValue(condition.operator) && <InputField label="Значення" value={condition.value} onChange={(value) => onChange({ ...condition, value })} />}
          </>
        )}
      </div>
    </details>
  );
}

function ConditionOptionPicker({
  field,
  value,
  multiple,
  onChange
}: {
  field: TradeInField;
  value: string;
  multiple: boolean;
  onChange: (value: string) => void;
}) {
  const selectedValues = value.split(',').map((item) => item.trim()).filter(Boolean);
  const selectedSet = new Set(selectedValues);

  const toggleOption = (optionValue: string) => {
    if (!multiple) {
      onChange(optionValue);
      return;
    }

    const nextValues = new Set(selectedValues);
    if (nextValues.has(optionValue)) nextValues.delete(optionValue);
    else nextValues.add(optionValue);

    onChange(field.options
      .filter((option) => nextValues.has(option.value))
      .map((option) => option.value)
      .join(','));
  };

  return (
    <div className="trade-in-condition-values">
      <header>
        <div>
          <strong>Значення</strong>
          <small>{multiple ? 'Оберіть один або декілька варіантів' : 'Оберіть один варіант'}</small>
        </div>
        <span>Обрано: {selectedSet.size}</span>
      </header>
      <div className="trade-in-condition-values__list" role="group" aria-label="Значення умови">
        {field.options.map((option) => {
          const checked = selectedSet.has(option.value);
          return (
            <label className={checked ? 'is-checked' : ''} key={option.id}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleOption(option.value)}
              />
              <i aria-hidden="true">✓</i>
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ConditionRuleEditor({
  condition,
  entries,
  index,
  canRemove,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMove
}: {
  condition: TradeInCondition;
  entries: GraphFieldEntry[];
  index: number;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (condition: TradeInCondition) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const selectedEntry = entries.find((entry) => entry.field.key === condition.fieldKey);
  const selectedNodeId = selectedEntry?.nodeId || '';
  const stepEntries = selectedNodeId ? entries.filter((entry) => entry.nodeId === selectedNodeId) : [];
  const selectedField = selectedEntry?.field;
  const options = conditionOperatorOptions(selectedField);
  const selectedOperator = options.some(([operator]) => operator === condition.operator)
    ? condition.operator
    : options[0]?.[0] || 'equals';

  const selectField = (fieldKey: string) => {
    const field = entries.find((entry) => entry.field.key === fieldKey)?.field;
    onChange({
      fieldKey,
      operator: field?.options.length ? 'equals' : field?.type === 'number' ? 'equals' : 'answered',
      value: field?.options[0]?.value || ''
    });
  };

  return (
    <section className="trade-in-condition-rule">
      <header>
        <strong>Правило {index + 1}</strong>
        <div>
          <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Перемістити правило вище">↑</button>
          <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Перемістити правило нижче">↓</button>
          <button type="button" disabled={!canRemove} onClick={onRemove} aria-label="Видалити правило">×</button>
        </div>
      </header>
      <div className="trade-in-condition-rule__source">
        <InputField label="Крок форми">
          <select value={selectedNodeId} onChange={(event) => {
            const firstField = entries.find((entry) => entry.nodeId === event.target.value)?.field;
            selectField(firstField?.key || '');
          }}>
            <option value="">Оберіть крок</option>
            {Array.from(new Map(entries.map((entry) => [entry.nodeId, entry.nodeTitle])).entries()).map(([nodeId, title]) => (
              <option value={nodeId} key={nodeId}>{title}</option>
            ))}
          </select>
        </InputField>
        <InputField label="Поле">
          <select value={condition.fieldKey} disabled={!selectedNodeId} onChange={(event) => selectField(event.target.value)}>
            <option value="">Оберіть поле</option>
            {stepEntries.map((entry) => (
              <option value={entry.field.key} key={entry.field.id}>{entry.field.label} ({entry.field.key})</option>
            ))}
          </select>
        </InputField>
      </div>
      {condition.fieldKey && (
        <div className="trade-in-condition-rule__comparison">
          <InputField label="Перевірка">
            <select value={selectedOperator} onChange={(event) => {
              const operator = event.target.value as TradeInConditionOperator;
              const firstValue = condition.value.split(',').map((value) => value.trim()).find(Boolean) || '';
              onChange({
                ...condition,
                operator,
                value: conditionNeedsValue(operator)
                  ? selectedField?.options.length && operator !== 'one_of'
                    ? firstValue || selectedField.options[0]?.value || ''
                    : condition.value
                  : ''
              });
            }}>
              {options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </InputField>
          {conditionNeedsValue(selectedOperator) && (
            selectedField?.options.length ? (
              <ConditionOptionPicker
                field={selectedField}
                value={condition.value}
                multiple={selectedOperator === 'one_of'}
                onChange={(value) => onChange({ ...condition, operator: selectedOperator, value })}
              />
            ) : (
              <InputField label="Значення">
                <input
                  type={selectedField?.type === 'number' ? 'number' : 'text'}
                  value={condition.value}
                  onChange={(event) => onChange({ ...condition, operator: selectedOperator, value: event.target.value })}
                />
              </InputField>
            )
          )}
        </div>
      )}
    </section>
  );
}

function FieldEditor({
  field,
  allFields,
  onChange,
  onLabelChange,
  onKeyChange,
  onCreateCondition,
  onRemove
}: {
  field: TradeInField;
  allFields: TradeInField[];
  onChange: (change: (field: TradeInField) => void) => void;
  onLabelChange: (value: string) => void;
  onKeyChange: (value: string) => void;
  onCreateCondition: () => void;
  onRemove: () => void;
}) {
  const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type);
  return (
    <section className="trade-in-graph-field-editor">
      <header>
        <div><small>Поле форми</small><h4>{field.label || 'Нове поле'}</h4></div>
        <div className="trade-in-graph-field-editor__actions">
          <button type="button" className="is-condition" onClick={onCreateCondition}><Icon name="variants" size={14} /> Створити умову</button>
          <button type="button" onClick={onRemove}><Icon name="delete" size={14} /> Видалити</button>
        </div>
      </header>
      <div className="trade-in-graph-inspector__grid">
        <InputField label="Назва поля" value={field.label} onChange={onLabelChange} />
        <InputField label="Технічний ключ" value={field.key} onChange={onKeyChange} />
        <InputField label="Тип поля">
          <select value={field.type} onChange={(event) => onChange((next) => { next.type = event.target.value as TradeInFieldType; })}>
            <option value="text">Текст</option>
            <option value="textarea">Багаторядковий текст</option>
            <option value="select">Список</option>
            <option value="radio">Один варіант</option>
            <option value="checkbox">Прапорці</option>
            <option value="email">Email</option>
            <option value="phone">Телефон</option>
            <option value="number">Число</option>
          </select>
        </InputField>
        <InputField label="Системне поле">
          <select value={field.systemFieldType || ''} onChange={(event) => onChange((next) => { next.systemFieldType = (event.target.value || null) as TradeInField['systemFieldType']; })}>
            <option value="">Звичайне поле</option>
            <option value="first_name">Імʼя клієнта</option>
            <option value="last_name">Прізвище</option>
            <option value="phone">Телефон</option>
          </select>
        </InputField>
        <InputField label="Placeholder" value={field.placeholder} onChange={(value) => onChange((next) => { next.placeholder = value; })} />
        <InputField label="Підказка" value={field.helpText} onChange={(value) => onChange((next) => { next.helpText = value; })} />
        {field.type === 'number' && (
          <>
            <InputField label="Мінімум" type="number" value={field.min ?? ''} onChange={(value) => onChange((next) => { next.min = value === '' ? null : Number(value); })} />
            <InputField label="Максимум" type="number" value={field.max ?? ''} onChange={(value) => onChange((next) => { next.max = value === '' ? null : Number(value); })} />
          </>
        )}
      </div>
      <div className="trade-in-graph-inspector__toggles">
        <Toggle label="Обов’язкове" checked={field.required} onChange={(value) => onChange((next) => { next.required = value; })} />
        <Toggle label="На всю ширину" checked={field.width === 'full'} onChange={(value) => onChange((next) => { next.width = value ? 'full' : 'half'; })} />
        <Toggle label="Показувати в основній інформації заявки" checked={field.showInSummary} onChange={(value) => onChange((next) => { next.showInSummary = value; })} />
      </div>

      {hasOptions && (
        <section className="trade-in-graph-options">
          <header>
            <div><strong>Варіанти відповіді</strong><small>{field.options.length} варіантів</small></div>
            <button type="button" onClick={() => onChange((next) => { next.options.push(createTradeInOption(next.options.length)); })}>+ Додати</button>
          </header>
          {field.options.map((option, index) => (
            <article key={option.id}>
              <input value={option.label} onChange={(event) => onChange((next) => { next.options[index].label = event.target.value; })} placeholder="Назва" />
              <input value={option.value} onChange={(event) => onChange((next) => { next.options[index].value = event.target.value; })} placeholder="Значення" />
              <button type="button" onClick={() => onChange((next) => { next.options.splice(index, 1); })}>×</button>
            </article>
          ))}
        </section>
      )}
      <FieldConditionEditor condition={field.condition} fields={allFields.filter((item) => item.id !== field.id)} onChange={(condition) => onChange((next) => { next.condition = condition; })} />
    </section>
  );
}

function NodePalette({ onAdd, style, toolbar = false, connectsNode = false }: {
  onAdd: (type: AddableNodeType) => void;
  style?: CSSProperties;
  toolbar?: boolean;
  connectsNode?: boolean;
}) {
  return (
    <div className={`trade-in-node-palette${toolbar ? ' is-toolbar' : ''}${connectsNode ? ' is-connection' : ''}`} style={style} onContextMenu={(event) => event.preventDefault()}>
      <header>
        <strong>{connectsNode ? 'Створити та з’єднати' : 'Додати ноду'}</strong>
        <small>{connectsNode ? 'Нова нода одразу продовжить цей зв’язок' : 'Нода створиться без зв’язків'}</small>
      </header>
      {addableTypes.map((type) => {
        const meta = typeMeta[type];
        return (
          <button type="button" onClick={() => onAdd(type)} key={type}>
            <span className={`is-${type}`}><Icon name={meta.icon} size={17} /></span>
            <div><strong>{meta.label}</strong><small>{meta.description}</small></div>
            <i>+</i>
          </button>
        );
      })}
    </div>
  );
}

function layoutGraph(graph: TradeInFormGraph) {
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  layout.setGraph({ rankdir: 'LR', ranksep: 110, nodesep: 65, marginx: 50, marginy: 50 });
  graph.nodes.forEach((node) => {
    const height = node.type === 'condition' ? Math.max(180, 130 + node.branches.length * 32) : 180;
    layout.setNode(node.id, { width: 300, height });
  });
  graph.edges.forEach((edge) => layout.setEdge(edge.source, edge.target));
  dagre.layout(layout);
  return graph.nodes.map((node) => {
    const value = layout.node(node.id);
    return { id: node.id, position: { x: value.x - 150, y: value.y - 90 } };
  });
}

function isEditableElement(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function getConnectionEndPoint(event: MouseEvent | TouchEvent) {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function pendingConnectionPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const direction = end.x >= start.x ? 1 : -1;
  const curve = Math.max(70, Math.abs(end.x - start.x) * 0.42);
  return `M ${start.x} ${start.y} C ${start.x + curve * direction} ${start.y}, ${end.x - curve * direction} ${end.y}, ${end.x} ${end.y}`;
}

function TradeInLogicCanvas({
  config,
  mutate,
  onUndo,
  canUndo,
  historyDepth
}: {
  config: TradeInConfig;
  mutate: (change: (next: TradeInConfig) => void) => void;
  onUndo: () => void;
  canUndo: boolean;
  historyDepth: number;
}) {
  const canvasRef = useRef<HTMLElement>(null);
  const lastCanvasPointerRef = useRef<{ x: number; y: number } | null>(null);
  const graph = useMemo(() => getTradeInFormGraph(config.form), [config.form]);
  const issues = useMemo(() => validateTradeInLogic(graph), [graph]);
  const allFields = useMemo(() => getTradeInGraphFields(graph), [graph]);
  const fieldEntries = useMemo(() => getTradeInGraphFieldEntries(graph), [graph]);
  const initialNodeId = graph.nodes.find((node) => node.type === 'start')?.id || graph.nodes[0]?.id || '';
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodeId);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(initialNodeId ? [initialNodeId] : []);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [toolbarPalette, setToolbarPalette] = useState(false);
  const [contextMenu, setContextMenu] = useState<NodePaletteState | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const clickConnectionRef = useRef<PendingConnection | null>(null);
  const manuallyEditedFieldKeysRef = useRef(new Set<string>());
  const { fitView, screenToFlowPosition } = useReactFlow();
  const store = useStoreApi();

  const cancelClickConnection = () => {
    clickConnectionRef.current = null;
    store.getState().cancelConnection();
    store.setState({ connectionClickStartHandle: null });
  };

  const flowNodes = useMemo((): GraphNode[] => graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      node,
      issues: issues.filter((issue) => issue.nodeId === node.id),
      conditionLabels: Object.fromEntries(node.branches.map((branch) => [branch.id, formatTradeInConditionBranch(graph, branch)]))
    }
  })), [graph, issues]);

  const flowEdges = useMemo((): GraphEdge[] => graph.edges.map((edge) => {
    const source = graph.nodes.find((node) => node.id === edge.source);
    const branch = source?.branches.find((item) => item.id === edge.sourceHandle);
    const label = source?.type === 'condition'
      ? branch?.label || source.defaultBranchLabel || 'Інші випадки'
      : '';
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      type: 'smoothstep',
      animated: false,
      label,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#695cff' },
      style: { stroke: '#695cff', strokeWidth: 2.2 },
      labelStyle: { fill: '#5145cd', fontSize: 9, fontWeight: 800 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.95 },
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 6
    };
  }), [graph.edges, graph.nodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdge>(flowEdges);

  const selectOnlyNode = (nodeId: string) => {
    const ids = nodeId ? [nodeId] : [];
    selectedNodeIdsRef.current = ids;
    setSelectedNodeIds(ids);
    setNodes((current) => current.map((node) => (
      node.selected === (node.id === nodeId)
        ? node
        : { ...node, selected: node.id === nodeId }
    )));
  };

  useEffect(() => {
    setNodes(flowNodes.map((node) => ({
      ...node,
      selected: selectedNodeIdsRef.current.includes(node.id)
    })));
    setEdges(flowEdges);
  }, [flowEdges, flowNodes, setEdges, setNodes]);

  useEffect(() => {
    const availableIds = new Set(graph.nodes.map((node) => node.id));
    setSelectedNodeIds((current) => {
      const filtered = current.filter((id) => availableIds.has(id));
      selectedNodeIdsRef.current = filtered;
      return filtered.length === current.length ? current : filtered;
    });
    if (!selectedNodeId || graph.nodes.some((node) => node.id === selectedNodeId)) return;
    const fallbackNodeId = graph.nodes.find((node) => node.type === 'start')?.id || graph.nodes[0]?.id || '';
    setSelectedNodeId(fallbackNodeId);
    selectOnlyNode(fallbackNodeId);
    setSelectedFieldId('');
  }, [graph.nodes, selectedNodeId]);

  const mutateGraph = (change: (nextGraph: TradeInFormGraph, nextConfig: TradeInConfig) => void) => {
    mutate((next) => {
      next.form.graph = structuredClone(getTradeInFormGraph(next.form));
      change(next.form.graph, next);
    });
  };

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedGraphNodes = graph.nodes.filter((node) => selectedNodeIds.includes(node.id));
  const deletableSelectedNodeIds = selectedGraphNodes.filter((node) => node.type !== 'start').map((node) => node.id);
  const selectedField = selectedNode?.fields.find((field) => field.id === selectedFieldId) || selectedNode?.fields[0] || null;
  const selectedIssues = issues.filter((issue) => !issue.nodeId || issue.nodeId === selectedNodeId);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;

  const updateNode = (change: (node: TradeInFormNode) => void) => {
    if (!selectedNode) return;
    mutateGraph((nextGraph) => {
      const node = nextGraph.nodes.find((item) => item.id === selectedNode.id);
      if (node) change(node);
    });
  };

  const updateField = (change: (field: TradeInField) => void) => {
    if (!selectedNode || !selectedField) return;
    updateNode((node) => {
      const field = node.fields.find((item) => item.id === selectedField.id);
      if (field) change(field);
    });
  };

  const updateSelectedFieldIdentity = (label: string, key: string) => {
    if (!selectedNode || !selectedField) return;
    const previousKey = selectedField.key;
    mutateGraph((nextGraph) => {
      const owner = nextGraph.nodes.find((node) => node.id === selectedNode.id);
      const field = owner?.fields.find((item) => item.id === selectedField.id);
      if (!field) return;
      field.label = label;
      field.key = key;
      if (!previousKey || previousKey === key) return;
      nextGraph.nodes.forEach((node) => {
        node.fields.forEach((item) => {
          if (item.condition.fieldKey === previousKey) item.condition.fieldKey = key;
        });
        node.branches.forEach((branch) => {
          if (branch.condition.fieldKey === previousKey) branch.condition.fieldKey = key;
          branch.conditionGroup?.conditions.forEach((condition) => {
            if (condition.fieldKey === previousKey) condition.fieldKey = key;
          });
        });
      });
    });
  };

  const updateSelectedFieldLabel = (label: string) => {
    if (!selectedField) return;
    const autoKey = transliterateTradeInFieldKey(selectedField.label);
    const isLegacyAutoKey = /^new_field_\d+$/.test(selectedField.key);
    const shouldUpdateKey = !manuallyEditedFieldKeysRef.current.has(selectedField.id)
      && (selectedField.key === autoKey || isLegacyAutoKey);
    const usedKeys = allFields.filter((field) => field.id !== selectedField.id).map((field) => field.key);
    updateSelectedFieldIdentity(
      label,
      shouldUpdateKey ? uniqueTradeInFieldKey(label, usedKeys) : selectedField.key
    );
  };

  const updateSelectedFieldKey = (value: string) => {
    if (!selectedField) return;
    manuallyEditedFieldKeysRef.current.add(selectedField.id);
    updateSelectedFieldIdentity(
      selectedField.label,
      value.trim() ? transliterateTradeInFieldKey(value) : ''
    );
  };

  const updateBranchGroup = (
    branchIndex: number,
    change: (conditions: TradeInCondition[], combinator: 'all' | 'any') => {
      conditions?: TradeInCondition[];
      combinator?: 'all' | 'any';
    } | void
  ) => {
    updateNode((node) => {
      const branch = node.branches[branchIndex];
      if (!branch) return;
      const current = structuredClone(tradeInConditionGroup(branch));
      const result = change(current.conditions, current.combinator);
      branch.conditionGroup = {
        combinator: result?.combinator ?? current.combinator,
        conditions: result?.conditions ?? current.conditions
      };
      branch.condition = branch.conditionGroup.conditions[0] || emptyTradeInCondition();
    });
  };

  const addNode = (
    type: AddableNodeType,
    desiredPosition: TradeInFormNodePosition,
    pendingConnection?: PendingConnection
  ) => {
    const position = findNearestFreeNodePosition(graph.nodes, desiredPosition);
    const node = createTradeInFormNode(type, position, graph.nodes.filter((item) => item.type === type).length);
    if (type === 'fields') node.fields.push(createTradeInField(0));
    mutateGraph((nextGraph) => {
      nextGraph.nodes.push(node);
      if (pendingConnection && canConnectTradeInGraph(
        nextGraph,
        pendingConnection.source,
        node.id,
        pendingConnection.sourceHandle
      )) {
        const edge: TradeInFormEdge = {
          id: tradeInId('form_edge'),
          source: pendingConnection.source,
          target: node.id,
          sourceHandle: pendingConnection.sourceHandle
        };
        nextGraph.edges = connectTradeInGraph(nextGraph, edge).edges;
      }
    });
    setSelectedNodeId(node.id);
    selectOnlyNode(node.id);
    setSelectedFieldId(node.fields[0]?.id || '');
    setToolbarPalette(false);
    setContextMenu(null);
  };

  const createConditionFromField = (sourceNode: TradeInFormNode, field: TradeInField) => {
    const position = findNearestFreeNodePosition(graph.nodes, {
      x: sourceNode.position.x + 360,
      y: sourceNode.position.y + 220
    });
    const node = createTradeInFormNode(
      'condition',
      position,
      graph.nodes.filter((item) => item.type === 'condition').length
    );
    const condition: TradeInCondition = {
      fieldKey: field.key,
      operator: field.options.length ? 'equals' : field.type === 'number' ? 'equals' : 'answered',
      value: field.options[0]?.value || ''
    };
    node.title = `Умова: ${field.label || field.key}`;
    node.branches[0].label = 'Умова виконується';
    node.branches[0].condition = condition;
    node.branches[0].conditionGroup = createTradeInConditionGroup(condition);
    const currentNext = graph.edges.find((edge) => edge.source === sourceNode.id && edge.sourceHandle === 'next');

    mutateGraph((nextGraph) => {
      nextGraph.nodes.push(node);
      if (currentNext) nextGraph.edges = nextGraph.edges.filter((edge) => edge.id !== currentNext.id);
      nextGraph.edges = connectTradeInGraph(nextGraph, {
        id: tradeInId('form_edge'),
        source: sourceNode.id,
        target: node.id,
        sourceHandle: 'next'
      }).edges;
      if (currentNext) {
        nextGraph.edges = connectTradeInGraph(nextGraph, {
          id: tradeInId('form_edge'),
          source: node.id,
          target: currentNext.target,
          sourceHandle: 'default'
        }).edges;
      }
    });
    setSelectedNodeId(node.id);
    selectOnlyNode(node.id);
    setSelectedFieldId('');
  };

  const addAtViewportCenter = (type: AddableNodeType) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const desired = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 200, y: 200 };
    addNode(type, desired);
  };

  const openPaletteAt = (
    clientX: number,
    clientY: number,
    centered = false,
    pendingConnection?: PendingConnection
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const paletteWidth = 270;
    const paletteHeight = 250;
    const requestedX = clientX - rect.left - (centered ? paletteWidth / 2 : 0);
    const requestedY = clientY - rect.top - (centered ? paletteHeight / 2 : 0);
    const sourceHandle = pendingConnection
      ? Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('.react-flow__handle.source') || []).find((handle) => (
        handle.dataset.nodeid === pendingConnection.source
        && (handle.dataset.handleid || 'next') === pendingConnection.sourceHandle
      ))
      : null;
    const sourceRect = sourceHandle?.getBoundingClientRect();
    cancelClickConnection();
    setToolbarPalette(false);
    setContextMenu({
      x: Math.min(Math.max(requestedX, 12), Math.max(12, rect.width - paletteWidth - 12)),
      y: Math.min(Math.max(requestedY, 12), Math.max(12, rect.height - paletteHeight - 12)),
      position: screenToFlowPosition({ x: clientX, y: clientY }),
      pendingConnection,
      lineStart: sourceRect
        ? {
            x: sourceRect.left + sourceRect.width / 2 - rect.left,
            y: sourceRect.top + sourceRect.height / 2 - rect.top
          }
        : undefined
    });
  };

  const openPaletteAtViewportCenter = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    openPaletteAt(rect.left + rect.width / 2, rect.top + rect.height / 2, true);
  };

  const handleConnect = (connection: Connection) => {
    const sourceHandle = connection.sourceHandle || 'next';
    if (!connection.source || !connection.target || !canConnectTradeInGraph(graph, connection.source, connection.target, sourceHandle)) return;
    const edge: TradeInFormEdge = {
      id: tradeInId('form_edge'),
      source: connection.source,
      target: connection.target,
      sourceHandle
    };
    mutateGraph((nextGraph) => {
      nextGraph.edges = connectTradeInGraph(nextGraph, edge).edges;
    });
  };

  const finishClickConnectionOnNode = (targetNodeId: string) => {
    const pendingConnection = clickConnectionRef.current;
    if (!pendingConnection || !canConnectTradeInGraph(
      graph,
      pendingConnection.source,
      targetNodeId,
      pendingConnection.sourceHandle
    )) return false;
    cancelClickConnection();
    handleConnect({
      source: pendingConnection.source,
      sourceHandle: pendingConnection.sourceHandle,
      target: targetNodeId,
      targetHandle: null
    });
    return true;
  };

  const handleConnectionEnd: OnConnectEnd = (event, connectionState) => {
    if (connectionState.isValid || !connectionState.fromNode || connectionState.fromHandle?.type !== 'source') return;
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element) || !eventTarget.classList.contains('react-flow__pane')) return;
    const point = getConnectionEndPoint(event);
    if (!point) return;
    openPaletteAt(point.x, point.y, false, {
      source: connectionState.fromNode.id,
      sourceHandle: connectionState.fromHandle.id || 'next'
    });
  };

  const finishClickConnectionOnPane = (
    target: EventTarget | null,
    clientX: number,
    clientY: number
  ) => {
    const pendingConnection = clickConnectionRef.current;
    if (!pendingConnection || !(target instanceof Element) || !target.classList.contains('react-flow__pane')) return false;
    openPaletteAt(clientX, clientY, false, pendingConnection);
    return true;
  };

  const removeEdges = (edgeIds: string[]) => {
    const deletedIds = new Set(edgeIds);
    if (!deletedIds.size) return;
    mutateGraph((nextGraph) => {
      nextGraph.edges = nextGraph.edges.filter((edge) => !deletedIds.has(edge.id));
    });
  };

  const removeSelectedNodes = () => {
    if (!deletableSelectedNodeIds.length) return;
    const fallbackNodeId = graph.nodes.find((node) => node.type === 'start')?.id || '';
    mutateGraph((nextGraph) => {
      let cleaned = nextGraph;
      deletableSelectedNodeIds.forEach((nodeId) => {
        cleaned = removeTradeInGraphNode(cleaned, nodeId);
      });
      nextGraph.nodes = cleaned.nodes;
      nextGraph.edges = cleaned.edges;
    });
    setSelectedNodeId(fallbackNodeId);
    selectOnlyNode(fallbackNodeId);
    setSelectedFieldId('');
  };

  const persistNodePositions = (draggedNodes: GraphNode[]) => {
    const positions = new Map(draggedNodes.map((node) => [node.id, node.position]));
    mutateGraph((nextGraph) => {
      nextGraph.nodes.forEach((node) => {
        const position = positions.get(node.id);
        if (position) node.position = position;
      });
    });
  };

  const autoLayout = () => {
    const positions = layoutGraph(graph);
    mutateGraph((nextGraph) => {
      positions.forEach(({ id, position }) => {
        const node = nextGraph.nodes.find((item) => item.id === id);
        if (node) node.position = position;
      });
    });
    window.requestAnimationFrame(() => fitView({ padding: 0.15, duration: 360 }));
  };

  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitView({ padding: 0.15, duration: 260 }));
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, fullscreen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndo = (event.ctrlKey || event.metaKey)
        && !event.altKey
        && !event.shiftKey
        && (event.code === 'KeyZ' || event.key.toLowerCase() === 'z');
      if (isUndo && canUndo) {
        event.preventDefault();
        event.stopPropagation();
        onUndo();
        return;
      }

      if (isEditableElement(event.target)) return;

      if (event.key === 'Delete' && deletableSelectedNodeIds.length) {
        event.preventDefault();
        event.stopPropagation();
        removeSelectedNodes();
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          const cursor = lastCanvasPointerRef.current;
          if (cursor) openPaletteAt(cursor.x, cursor.y);
          else openPaletteAtViewportCenter();
        }
        return;
      }

      if (event.key === 'Escape') {
        if (clickConnectionRef.current) {
          event.preventDefault();
          cancelClickConnection();
          return;
        }
        if (contextMenu || toolbarPalette) {
          event.preventDefault();
          setContextMenu(null);
          setToolbarPalette(false);
          return;
        }
        if (fullscreen) {
          event.preventDefault();
          setFullscreen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  });

  return (
    <div className={`trade-in-logic-editor${fullscreen ? ' is-fullscreen' : ''}`}>
      <header className="trade-in-logic-toolbar">
        <div>
          <p className="eyebrow">Редактор сценарію</p>
          <h2>Конструктор форми</h2>
          <p>Створюйте кроки, умови й завершення, а потім з’єднуйте їх у потрібному порядку.</p>
        </div>
        <div className="trade-in-logic-toolbar__actions">
          <span className={errorCount ? 'has-errors' : ''}><Icon name={errorCount ? 'alarm' : 'check'} size={15} />{errorCount ? `${errorCount} помилок` : 'Сценарій коректний'}</span>
          <button
            className="button button--secondary button--small"
            type="button"
            disabled={!canUndo}
            title={canUndo ? `Скасувати останню дію (${historyDepth} у пам’яті)` : 'Немає дій для скасування'}
            onClick={onUndo}
          >
            <Icon name="undo" size={15} /> Скасувати
          </button>
          <button className="button button--secondary button--small" type="button" onClick={() => {
            const start = graph.nodes.find((node) => node.type === 'start');
            if (start) {
              setSelectedNodeId(start.id);
              selectOnlyNode(start.id);
            }
          }}><Icon name="characteristics" size={15} /> Налаштування</button>
          <button className="button button--secondary button--small" type="button" onClick={autoLayout}><Icon name="refresh" size={15} /> Вирівняти</button>
          {deletableSelectedNodeIds.length > 1 && (
            <button className="button button--secondary button--small trade-in-logic-delete-selection" type="button" onClick={removeSelectedNodes}>
              <Icon name="delete" size={15} /> Видалити {deletableSelectedNodeIds.length}
            </button>
          )}
          <button
            className="button button--secondary button--small"
            type="button"
            aria-label={fullscreen ? 'Вийти з повноекранного режиму' : 'Відкрити редактор на весь екран'}
            title={fullscreen ? 'Вийти з повноекранного режиму' : 'Відкрити редактор на весь екран'}
            onClick={() => setFullscreen((value) => !value)}
          >
            <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={16} />
            {fullscreen ? 'Згорнути' : 'На весь екран'}
          </button>
          <button className="button button--primary button--small" type="button" onClick={() => {
            cancelClickConnection();
            setToolbarPalette((value) => !value);
            setContextMenu(null);
          }}><Icon name="add" size={15} /> Додати ноду</button>
          {toolbarPalette && <NodePalette toolbar onAdd={addAtViewportCenter} />}
        </div>
      </header>

      <div className="trade-in-logic-workspace">
        <section
          className="trade-in-logic-canvas"
          aria-label="Графічний редактор форми"
          ref={canvasRef}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => {
            finishClickConnectionOnPane(event.target, event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            lastCanvasPointerRef.current = { x: event.clientX, y: event.clientY };
          }}
        >
          <ReactFlow<GraphNode, GraphEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              finishClickConnectionOnNode(node.id);
              setSelectedNodeId(node.id);
              setSelectedFieldId('');
              setContextMenu(null);
            }}
            onSelectionChange={({ nodes: selectedNodes }) => {
              const ids = selectedNodes.map((node) => node.id);
              selectedNodeIdsRef.current = ids;
              setSelectedNodeIds((current) => (
                current.length === ids.length && current.every((id, index) => id === ids[index])
                  ? current
                  : ids
              ));
              if (!ids.length) {
                setSelectedNodeId('');
                setSelectedFieldId('');
              } else if (!ids.includes(selectedNodeId)) {
                setSelectedNodeId(ids.at(-1) || '');
                setSelectedFieldId('');
              }
            }}
            onNodeDragStop={(_, draggedNode, draggedNodes) => persistNodePositions(
              draggedNodes.length ? draggedNodes : [draggedNode]
            )}
            onConnect={handleConnect}
            onConnectEnd={handleConnectionEnd}
            onClickConnectStart={(_, params) => {
              clickConnectionRef.current = params.nodeId && params.handleType === 'source'
                ? { source: params.nodeId, sourceHandle: params.handleId || 'next' }
                : null;
              setContextMenu(null);
              setToolbarPalette(false);
            }}
            onClickConnectEnd={() => {
              clickConnectionRef.current = null;
            }}
            onEdgesDelete={(deleted) => removeEdges(deleted.map((edge) => edge.id))}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu(null);
              setToolbarPalette(false);
              if (event.altKey) removeEdges([edge.id]);
            }}
            isValidConnection={(connection) => Boolean(connection.source && connection.target && canConnectTradeInGraph(
              graph,
              connection.source,
              connection.target,
              connection.sourceHandle || 'next'
            ))}
            onPaneClick={(event) => {
              if (finishClickConnectionOnPane(event.target, event.clientX, event.clientY)) return;
              setSelectedNodeId('');
              selectOnlyNode('');
              setSelectedFieldId('');
              setContextMenu(null);
              setToolbarPalette(false);
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              openPaletteAt(event.clientX, event.clientY);
            }}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              setSelectedNodeId(node.id);
              if (!selectedNodeIds.includes(node.id)) selectOnlyNode(node.id);
              openPaletteAt(event.clientX, event.clientY);
            }}
            panOnDrag={[1]}
            panOnScroll={false}
            panActivationKeyCode={null}
            connectOnClick
            autoPanOnNodeDrag={false}
            autoPanOnConnect={false}
            autoPanOnSelection={false}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            selectionKeyCode={null}
            multiSelectionKeyCode="Shift"
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.25}
            maxZoom={1.6}
            edgesReconnectable={false}
            connectionLineStyle={{ stroke: '#695cff', strokeWidth: 2.2 }}
            defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} size={1} color="#d8dce5" />
            <MiniMap nodeColor={(node) => {
              const type = (node.data as GraphNodeData | undefined)?.node.type;
              return type === 'condition' ? '#f79009' : type === 'finish' ? '#12b76a' : type === 'start' ? '#344054' : '#695cff';
            }} maskColor="rgba(246,247,251,.78)" pannable={false} zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
          {contextMenu?.pendingConnection && contextMenu.lineStart && (
            <svg className="trade-in-pending-connection" aria-hidden="true">
              <path d={pendingConnectionPath(contextMenu.lineStart, { x: contextMenu.x, y: contextMenu.y + 46 })} />
              <circle cx={contextMenu.x} cy={contextMenu.y + 46} r="4" />
            </svg>
          )}
          {contextMenu && (
            <NodePalette
              style={{ left: contextMenu.x, top: contextMenu.y }}
              connectsNode={Boolean(contextMenu.pendingConnection)}
              onAdd={(type) => addNode(type, contextMenu.position, contextMenu.pendingConnection)}
            />
          )}
        </section>

        <aside className="trade-in-logic-inspector">
          {selectedGraphNodes.length > 1 ? (
            <section className="trade-in-logic-multi-selection">
              <div className="trade-in-logic-multi-selection__icon"><Icon name="viewGrid" size={24} /></div>
              <div>
                <small>Групове виділення</small>
                <h3>Вибрано нод: {selectedGraphNodes.length}</h3>
                <p>Перетягніть будь-яку вибрану ноду, щоб перемістити всю групу одночасно.</p>
              </div>
              <div className="trade-in-logic-multi-selection__items">
                {selectedGraphNodes.map((node) => <span key={node.id}>{node.title || typeMeta[node.type].label}</span>)}
              </div>
              <button className="button button--secondary trade-in-logic-delete-selection" type="button" onClick={removeSelectedNodes}>
                <Icon name="delete" size={15} /> Видалити вибрані ({deletableSelectedNodeIds.length})
              </button>
              {selectedGraphNodes.some((node) => node.type === 'start') && (
                <p className="trade-in-logic-multi-selection__note">Стартова нода залишиться — її не можна видалити.</p>
              )}
            </section>
          ) : !selectedNode ? <div className="trade-in-logic-inspector__empty">Оберіть ноду для налаштування.</div> : (
            <>
              <header>
                <div><small>{typeMeta[selectedNode.type].label}</small><h3>{selectedNode.title || typeMeta[selectedNode.type].label}</h3></div>
                {selectedNode.type !== 'start' && <button className="is-danger" type="button" onClick={removeSelectedNodes}><Icon name="delete" size={14} /> Видалити</button>}
              </header>

              {selectedNode.type === 'start' && (
                <div className="trade-in-graph-inspector__body">
                  <p className="trade-in-graph-inspector__intro">Загальні тексти та поведінка всієї покрокової форми.</p>
                  <InputField label="Заголовок форми" value={config.form.title} onChange={(value) => mutate((next) => { next.form.title = value; })} />
                  <InputField label="Опис форми" textarea value={config.form.description} onChange={(value) => mutate((next) => { next.form.description = value; })} />
                  <div className="trade-in-graph-inspector__grid">
                    <InputField label="Кнопка «Назад»" value={config.form.backLabel} onChange={(value) => mutate((next) => { next.form.backLabel = value; })} />
                    <InputField label="Кнопка «Далі»" value={config.form.nextLabel} onChange={(value) => mutate((next) => { next.form.nextLabel = value; })} />
                    <InputField label="Кнопка відправлення" value={config.form.submitLabel} onChange={(value) => mutate((next) => { next.form.submitLabel = value; })} />
                  </div>
                  <div className="trade-in-graph-inspector__toggles">
                    <Toggle label="Показувати прогрес" checked={config.form.showProgress} onChange={(value) => mutate((next) => { next.form.showProgress = value; })} />
                    <Toggle label="Номери кроків" checked={config.form.showStepNumbers} onChange={(value) => mutate((next) => { next.form.showStepNumbers = value; })} />
                    <Toggle label="Підсумок" checked={config.form.showSummary} onChange={(value) => mutate((next) => { next.form.showSummary = value; })} />
                  </div>
                </div>
              )}

              {selectedNode.type === 'fields' && (
                <div className="trade-in-graph-inspector__body">
                  <InputField label="Назва кроку" value={selectedNode.title} onChange={(value) => updateNode((node) => { node.title = value; })} />
                  <InputField label="Опис кроку" textarea value={selectedNode.description} onChange={(value) => updateNode((node) => { node.description = value; })} />
                  <section className="trade-in-graph-fields-list">
                    <header>
                      <div><strong>Поля кроку</strong><small>{selectedNode.fields.length} полів</small></div>
                      <button type="button" onClick={() => {
                        const field = createTradeInField(allFields.length);
                        updateNode((node) => { node.fields.push(field); });
                        setSelectedFieldId(field.id);
                      }}>+ Додати</button>
                    </header>
                    {selectedNode.fields.map((field, index) => (
                      <article className={selectedField?.id === field.id ? 'is-active' : ''} key={field.id}>
                        <button type="button" onClick={() => setSelectedFieldId(field.id)}><span>{field.type}</span><strong>{field.label || field.key || 'Нове поле'}</strong></button>
                        <div>
                          <button disabled={index === 0} type="button" onClick={() => updateNode((node) => { node.fields = moveTradeInItem(node.fields, index, -1); })}>↑</button>
                          <button disabled={index === selectedNode.fields.length - 1} type="button" onClick={() => updateNode((node) => { node.fields = moveTradeInItem(node.fields, index, 1); })}>↓</button>
                        </div>
                      </article>
                    ))}
                  </section>
                  {selectedField && <FieldEditor
                    field={selectedField}
                    allFields={allFields}
                    onChange={updateField}
                    onLabelChange={updateSelectedFieldLabel}
                    onKeyChange={updateSelectedFieldKey}
                    onCreateCondition={() => createConditionFromField(selectedNode, selectedField)}
                    onRemove={() => {
                      const index = selectedNode.fields.findIndex((field) => field.id === selectedField.id);
                      updateNode((node) => { node.fields.splice(index, 1); });
                      setSelectedFieldId(selectedNode.fields[index + 1]?.id || selectedNode.fields[index - 1]?.id || '');
                    }}
                  />}
                </div>
              )}

              {selectedNode.type === 'condition' && (
                <div className="trade-in-graph-inspector__body">
                  <InputField label="Назва умови" value={selectedNode.title} onChange={(value) => updateNode((node) => { node.title = value; })} />
                  <InputField label="Опис" textarea value={selectedNode.description} onChange={(value) => updateNode((node) => { node.description = value; })} />
                  <section className="trade-in-graph-branches">
                    <header>
                      <div><strong>Гілки умови</strong><small>Перевіряються згори вниз</small></div>
                      <button type="button" onClick={() => updateNode((node) => {
                        node.branches.push({
                          id: tradeInId('branch'),
                          label: `Варіант ${node.branches.length + 1}`,
                          condition: emptyTradeInCondition(),
                          conditionGroup: createTradeInConditionGroup()
                        });
                      })}>+ Гілка</button>
                    </header>
                    {selectedNode.branches.map((branch, index) => {
                      const group = tradeInConditionGroup(branch);
                      return (
                        <article key={branch.id}>
                          <header><strong>Гілка {index + 1}</strong><button type="button" onClick={() => mutateGraph((nextGraph) => {
                            const node = nextGraph.nodes.find((item) => item.id === selectedNode.id);
                            if (!node) return;
                            const removed = node.branches.splice(index, 1)[0];
                            nextGraph.edges = nextGraph.edges.filter((edge) => !(edge.source === node.id && edge.sourceHandle === removed?.id));
                          })}>×</button></header>
                          <InputField label="Підпис виходу" value={branch.label} onChange={(value) => updateNode((node) => { node.branches[index].label = value; })} />
                          <div className="trade-in-condition-combinator">
                            <span>Як поєднати правила</span>
                            <div>
                              <button
                                type="button"
                                className={group.combinator === 'all' ? 'is-active' : ''}
                                onClick={() => updateBranchGroup(index, () => ({ combinator: 'all' }))}
                              >Усі (І)</button>
                              <button
                                type="button"
                                className={group.combinator === 'any' ? 'is-active' : ''}
                                onClick={() => updateBranchGroup(index, () => ({ combinator: 'any' }))}
                              >Будь-яке (АБО)</button>
                            </div>
                          </div>
                          <div className="trade-in-condition-rules">
                            {group.conditions.map((condition, ruleIndex) => (
                              <ConditionRuleEditor
                                condition={condition}
                                entries={fieldEntries}
                                index={ruleIndex}
                                canRemove={group.conditions.length > 1}
                                canMoveUp={ruleIndex > 0}
                                canMoveDown={ruleIndex < group.conditions.length - 1}
                                onChange={(nextCondition) => updateBranchGroup(index, (conditions) => {
                                  conditions[ruleIndex] = nextCondition;
                                })}
                                onRemove={() => updateBranchGroup(index, (conditions) => {
                                  conditions.splice(ruleIndex, 1);
                                })}
                                onMove={(direction) => updateBranchGroup(index, (conditions) => ({
                                  conditions: moveTradeInItem(conditions, ruleIndex, direction)
                                }))}
                                key={`${branch.id}-${ruleIndex}`}
                              />
                            ))}
                            {!group.conditions.length && <p className="trade-in-condition-rules__empty">Додайте перше правило для цієї гілки.</p>}
                            <button
                              type="button"
                              className="trade-in-condition-rules__add"
                              onClick={() => updateBranchGroup(index, (conditions) => {
                                conditions.push(emptyTradeInCondition());
                              })}
                            >+ Додати правило</button>
                          </div>
                        </article>
                      );
                    })}
                    <article className="is-default">
                      <header><strong>Резервна гілка</strong><span>default</span></header>
                      <InputField label="Підпис виходу" value={selectedNode.defaultBranchLabel} onChange={(value) => updateNode((node) => { node.defaultBranchLabel = value; })} />
                    </article>
                  </section>
                </div>
              )}

              {selectedNode.type === 'information' && (
                <div className="trade-in-graph-inspector__body">
                  <InputField label="Заголовок" value={selectedNode.title} onChange={(value) => updateNode((node) => { node.title = value; })} />
                  <InputField label="Інформаційний текст" textarea value={selectedNode.description} onChange={(value) => updateNode((node) => { node.description = value; })} />
                </div>
              )}

              {selectedNode.type === 'finish' && (
                <div className="trade-in-graph-inspector__body">
                  <p className="trade-in-graph-inspector__intro">Коли клієнт потрапить у цю ноду, заявка буде відправлена менеджеру.</p>
                  <InputField label="Заголовок після відправлення" value={selectedNode.title} onChange={(value) => updateNode((node) => { node.title = value; })} />
                  <InputField label="Повідомлення клієнту" textarea value={selectedNode.description} onChange={(value) => updateNode((node) => { node.description = value; })} />
                </div>
              )}

              <section className="trade-in-logic-issues">
                <header><strong>Перевірка</strong><span>{selectedIssues.length}</span></header>
                {!selectedIssues.length && <p className="is-valid"><Icon name="check" size={14} /> Помилок не знайдено</p>}
                {selectedIssues.map((issue) => (
                  <article className={`is-${issue.severity}`} key={issue.id}>
                    <Icon name={issue.severity === 'error' ? 'alarm' : 'other'} size={14} />
                    <div><strong>{issue.title}</strong><p>{issue.description}</p></div>
                  </article>
                ))}
              </section>
            </>
          )}
        </aside>
      </div>
      <footer className="trade-in-logic-help">
        <span><i /> Суцільна лінія — перехід між нодами</span>
        <span><kbd>Клік / Drag</kbd> Протягнути зв’язок</span>
        <span><kbd>Колесо</kbd> Рух полотна</span>
        <span><kbd>ЛКМ</kbd> Рамка вибору</span>
        <span><kbd>Shift</kbd> Мультивибір</span>
        <span><kbd>ПКМ</kbd> Меню додавання</span>
        <span><kbd>Alt+ПКМ</kbd> Розірвати зв’язок</span>
        <span><kbd>Space</kbd> Додати ноду</span>
        <span><kbd>Del</kbd> Видалити вибрані</span>
        <span><kbd>Ctrl+Z</kbd> Скасувати дію</span>
      </footer>
    </div>
  );
}

export function TradeInLogicEditor(props: {
  config: TradeInConfig;
  mutate: (change: (next: TradeInConfig) => void) => void;
  onUndo: () => void;
  canUndo: boolean;
  historyDepth: number;
}) {
  return <ReactFlowProvider><TradeInLogicCanvas {...props} /></ReactFlowProvider>;
}
