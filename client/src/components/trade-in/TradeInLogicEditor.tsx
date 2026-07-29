import { useCallback, useEffect, useMemo, useState } from 'react';
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
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react';
import { Icon } from '../Icon';
import {
  canConnectTradeInSteps,
  createTradeInStepCondition,
  formatTradeInCondition,
  getTradeInConditionSource,
  tradeInConditionOperatorLabels,
  validateTradeInLogic,
  type TradeInLogicIssue
} from '../../lib/trade-in-logic';
import { createTradeInStep, emptyTradeInCondition } from '../../lib/trade-in';
import type {
  TradeInCondition,
  TradeInConditionOperator,
  TradeInConfig,
  TradeInField,
  TradeInStep
} from '../../types/trade-in';
import '@xyflow/react/dist/style.css';
import '../../styles/trade-in-logic-editor.css';

const nodeWidth = 278;
const nodeHeight = 168;

type StepNodeData = {
  step: TradeInStep;
  stepIndex: number;
  conditionLabel: string;
  issues: TradeInLogicIssue[];
};

type StepNode = Node<StepNodeData, 'tradeInStep'>;
type LogicEdge = Edge<{ kind: 'sequence' | 'condition' | 'invalid' }>;

const operatorOptions = Object.entries(tradeInConditionOperatorLabels) as Array<[TradeInConditionOperator, string]>;

function TradeInStepNode({ data, selected }: NodeProps<StepNode>) {
  const errorCount = data.issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = data.issues.length - errorCount;

  return (
    <article className={`trade-in-logic-node${selected ? ' is-selected' : ''}${errorCount ? ' has-error' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <header>
        <span>{String(data.stepIndex + 1).padStart(2, '0')}</span>
        <div>
          <small>Крок форми</small>
          <strong>{data.step.title || `Крок ${data.stepIndex + 1}`}</strong>
        </div>
        {data.issues.length > 0 && (
          <i className={errorCount ? 'is-error' : 'is-warning'} title={`${errorCount} помилок, ${warningCount} попереджень`}>
            {data.issues.length}
          </i>
        )}
      </header>
      <p>{data.step.description || 'Без додаткового опису'}</p>
      <div className="trade-in-logic-node__fields">
        {data.step.fields.slice(0, 3).map((field) => <span key={field.id}>{field.label || field.key || 'Поле без назви'}</span>)}
        {data.step.fields.length > 3 && <span>+{data.step.fields.length - 3}</span>}
        {!data.step.fields.length && <span className="is-empty">Поля ще не додані</span>}
      </div>
      <footer className={data.step.condition.fieldKey ? 'is-conditional' : ''}>
        <Icon name={data.step.condition.fieldKey ? 'variants' : 'arrowRight'} size={13} />
        <span>{data.conditionLabel}</span>
      </footer>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

const nodeTypes = { tradeInStep: TradeInStepNode };

function layoutNodes(nodes: StepNode[], edges: LogicEdge[]) {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', ranksep: 92, nodesep: 46, marginx: 38, marginy: 38 });
  nodes.forEach((node) => graph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - nodeWidth / 2,
        y: position.y - nodeHeight / 2
      }
    };
  });
}

function createFlowElements(steps: TradeInStep[], issues: TradeInLogicIssue[]) {
  const nodes: StepNode[] = steps.map((step, stepIndex) => ({
    id: step.id,
    type: 'tradeInStep',
    position: { x: 0, y: 0 },
    data: {
      step,
      stepIndex,
      conditionLabel: formatTradeInCondition(steps, step.condition),
      issues: issues.filter((issue) => issue.stepId === step.id)
    }
  }));

  const edges: LogicEdge[] = [];
  steps.forEach((step, index) => {
    if (index === 0) return;
    const source = getTradeInConditionSource(steps, step.condition);
    const sourceStep = source?.step || steps[index - 1];
    const invalid = Boolean(step.condition.fieldKey && (!source || source.stepIndex >= index));
    const conditional = Boolean(step.condition.fieldKey);
    edges.push({
      id: `${conditional ? 'condition' : 'sequence'}-${step.id}`,
      source: sourceStep.id,
      target: step.id,
      type: 'smoothstep',
      animated: conditional && !invalid,
      selectable: conditional,
      deletable: false,
      label: conditional ? formatTradeInCondition(steps, step.condition) : 'За порядком',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: invalid ? '#d92d20' : conditional ? '#695cff' : '#98a2b3'
      },
      style: {
        stroke: invalid ? '#d92d20' : conditional ? '#695cff' : '#98a2b3',
        strokeDasharray: conditional ? undefined : '6 6',
        strokeWidth: conditional ? 2.2 : 1.5
      },
      labelStyle: {
        fill: invalid ? '#b42318' : conditional ? '#5145cd' : '#667085',
        fontSize: 10,
        fontWeight: 700
      },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.94 },
      labelBgPadding: [7, 4],
      labelBgBorderRadius: 6,
      data: { kind: invalid ? 'invalid' : conditional ? 'condition' : 'sequence' }
    });
  });

  return { nodes: layoutNodes(nodes, edges), edges };
}

function ConditionValueEditor({
  field,
  condition,
  onChange
}: {
  field: TradeInField;
  condition: TradeInCondition;
  onChange: (condition: TradeInCondition) => void;
}) {
  if (condition.operator === 'answered') {
    return <p className="trade-in-logic-inspector__hint">Для цієї перевірки достатньо, щоб клієнт заповнив поле.</p>;
  }

  if (condition.operator === 'one_of' && field.options.length) {
    const values = condition.value.split(',').map((value) => value.trim()).filter(Boolean);
    return (
      <fieldset className="trade-in-logic-values">
        <legend>Допустимі значення</legend>
        {field.options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              onChange={(event) => {
                const nextValues = event.target.checked
                  ? [...values, option.value]
                  : values.filter((value) => value !== option.value);
                onChange({ ...condition, value: nextValues.join(',') });
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <label className="field">
      <span>Значення</span>
      {field.options.length ? (
        <select value={condition.value} onChange={(event) => onChange({ ...condition, value: event.target.value })}>
          <option value="">Оберіть значення</option>
          {field.options.map((option) => <option value={option.value} key={option.id}>{option.label}</option>)}
        </select>
      ) : (
        <input
          value={condition.value}
          onChange={(event) => onChange({ ...condition, value: event.target.value })}
          placeholder="Введіть значення"
        />
      )}
    </label>
  );
}

function TradeInLogicEditorCanvas({
  config,
  mutate,
  onEditStep
}: {
  config: TradeInConfig;
  mutate: (change: (next: TradeInConfig) => void) => void;
  onEditStep: (stepId: string) => void;
}) {
  const steps = config.form.steps;
  const issues = useMemo(() => validateTradeInLogic(steps), [steps]);
  const flowElements = useMemo(() => createFlowElements(steps, issues), [issues, steps]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(flowElements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<LogicEdge>(flowElements.edges);
  const [selectedStepId, setSelectedStepId] = useState(steps[0]?.id || '');
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes((currentNodes) => flowElements.nodes.map((node) => ({
      ...node,
      position: currentNodes.find((current) => current.id === node.id)?.position || node.position
    })));
    setEdges(flowElements.edges);
  }, [flowElements, setEdges, setNodes]);

  useEffect(() => {
    if (steps.some((step) => step.id === selectedStepId)) return;
    setSelectedStepId(steps[0]?.id || '');
  }, [selectedStepId, steps]);

  const selectedStep = steps.find((step) => step.id === selectedStepId) || null;
  const selectedStepIndex = selectedStep ? steps.findIndex((step) => step.id === selectedStep.id) : -1;
  const conditionSource = selectedStep ? getTradeInConditionSource(steps, selectedStep.condition) : null;
  const candidateSources = selectedStepIndex > 0
    ? steps.slice(0, selectedStepIndex).filter((step) => step.fields.some((field) => field.key.trim()))
    : [];
  const selectedSourceStep = conditionSource?.step || candidateSources[0] || null;
  const selectedSourceField = selectedSourceStep?.fields.find((field) => field.key === selectedStep?.condition.fieldKey)
    || selectedSourceStep?.fields.find((field) => field.key.trim())
    || null;
  const selectedIssues = issues.filter((issue) => !issue.stepId || issue.stepId === selectedStepId);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;

  const updateCondition = useCallback((targetStepId: string, condition: TradeInCondition) => {
    mutate((next) => {
      const target = next.form.steps.find((step) => step.id === targetStepId);
      if (target) target.condition = condition;
    });
  }, [mutate]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const condition = createTradeInStepCondition(steps, connection.source);
    if (!condition || !canConnectTradeInSteps(steps, connection.source, connection.target)) return;
    updateCondition(connection.target, condition);
    setSelectedStepId(connection.target);
  }, [steps, updateCondition]);

  const handleAutoLayout = () => {
    setNodes(flowElements.nodes);
    window.requestAnimationFrame(() => fitView({ padding: 0.18, duration: 360 }));
  };

  const addStep = () => {
    const step = createTradeInStep(steps.length);
    mutate((next) => { next.form.steps.push(step); });
    setSelectedStepId(step.id);
  };

  return (
    <div className="trade-in-logic-editor">
      <header className="trade-in-logic-toolbar">
        <div>
          <p className="eyebrow">Сценарій форми</p>
          <h2>Логіка переходів</h2>
          <p>Перетягніть стрілку з попереднього кроку до наступного, а потім задайте умову у правій панелі.</p>
        </div>
        <div className="trade-in-logic-toolbar__actions">
          <span className={errorCount ? 'has-errors' : ''}>
            <Icon name={errorCount ? 'alarm' : 'check'} size={15} />
            {errorCount ? `${errorCount} помилок` : 'Логіка коректна'}
          </span>
          <button className="button button--secondary button--small" type="button" onClick={handleAutoLayout}>
            <Icon name="refresh" size={15} /> Вирівняти
          </button>
          <button className="button button--primary button--small" type="button" onClick={addStep}>
            <Icon name="add" size={15} /> Додати крок
          </button>
        </div>
      </header>

      <div className="trade-in-logic-workspace">
        <section className="trade-in-logic-canvas" aria-label="Граф логіки форми">
          {steps.length ? (
            <ReactFlow<StepNode, LogicEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onNodeClick={(_, node) => setSelectedStepId(node.id)}
              onEdgeClick={(_, edge) => edge.data?.kind !== 'sequence' && setSelectedStepId(edge.target)}
              isValidConnection={(connection) => Boolean(
                connection.source
                && connection.target
                && canConnectTradeInSteps(steps, connection.source, connection.target)
              )}
              defaultEdgeOptions={{ type: 'smoothstep' }}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesConnectable
              edgesReconnectable={false}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} size={1} color="#d8dce5" />
              <MiniMap
                nodeColor={(node) => (node.data as StepNodeData | undefined)?.issues.some((issue) => issue.severity === 'error') ? '#f04438' : '#695cff'}
                maskColor="rgba(246, 247, 251, .76)"
                pannable
                zoomable
              />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : (
            <div className="trade-in-logic-empty">
              <Icon name="variants" size={34} />
              <strong>У формі ще немає кроків</strong>
              <p>Додайте перший крок, а потім налаштуйте його поля.</p>
              <button className="button button--primary button--small" type="button" onClick={addStep}>Додати крок</button>
            </div>
          )}
        </section>

        <aside className="trade-in-logic-inspector">
          {!selectedStep ? (
            <div className="trade-in-logic-inspector__empty">Оберіть крок на схемі.</div>
          ) : (
            <>
              <header>
                <div>
                  <small>Вибраний крок {selectedStepIndex + 1}</small>
                  <h3>{selectedStep.title || `Крок ${selectedStepIndex + 1}`}</h3>
                </div>
                <button type="button" onClick={() => onEditStep(selectedStep.id)}><Icon name="edit" size={14} /> Поля</button>
              </header>

              {selectedStepIndex === 0 ? (
                <div className="trade-in-logic-start">
                  <span><Icon name="arrowRight" size={17} /></span>
                  <div><strong>Початок сценарію</strong><p>Перший крок завжди відкривається без умови.</p></div>
                  {selectedStep.condition.fieldKey && (
                    <button type="button" onClick={() => updateCondition(selectedStep.id, emptyTradeInCondition())}>
                      Прибрати некоректну умову
                    </button>
                  )}
                </div>
              ) : (
                <div className="trade-in-logic-condition-panel">
                  <div className="trade-in-logic-mode">
                    <span className={!selectedStep.condition.fieldKey ? 'is-active' : ''}>За порядком</span>
                    <span className={selectedStep.condition.fieldKey ? 'is-active' : ''}>За умовою</span>
                  </div>

                  {!selectedStep.condition.fieldKey ? (
                    <div className="trade-in-logic-sequence">
                      <p>Крок відкриється після попереднього без додаткової перевірки.</p>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        disabled={!candidateSources.length}
                        onClick={() => {
                          const source = candidateSources.at(-1);
                          const condition = source ? createTradeInStepCondition(steps, source.id) : null;
                          if (condition) updateCondition(selectedStep.id, condition);
                        }}
                      >
                        <Icon name="variants" size={14} /> Додати умову
                      </button>
                      {!candidateSources.length && <small>У попередніх кроках немає полів із ключами.</small>}
                    </div>
                  ) : (
                    <>
                      <label className="field">
                        <span>З якого кроку</span>
                        <select
                          value={selectedSourceStep?.id || ''}
                          onChange={(event) => {
                            const condition = createTradeInStepCondition(steps, event.target.value);
                            if (condition) updateCondition(selectedStep.id, condition);
                          }}
                        >
                          {!conditionSource && <option value="">Невідоме джерело</option>}
                          {candidateSources.map((step, index) => (
                            <option value={step.id} key={step.id}>{index + 1}. {step.title || 'Крок без назви'}</option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Поле відповіді</span>
                        <select
                          value={selectedStep.condition.fieldKey}
                          onChange={(event) => {
                            const field = selectedSourceStep?.fields.find((item) => item.key === event.target.value);
                            if (!field) return;
                            updateCondition(selectedStep.id, {
                              fieldKey: field.key,
                              operator: field.options.length ? 'equals' : 'answered',
                              value: field.options[0]?.value || ''
                            });
                          }}
                        >
                          {!selectedSourceField && <option value={selectedStep.condition.fieldKey}>{selectedStep.condition.fieldKey}</option>}
                          {selectedSourceStep?.fields.filter((field) => field.key.trim()).map((field) => (
                            <option value={field.key} key={field.id}>{field.label || field.key}</option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Перевірка</span>
                        <select
                          value={selectedStep.condition.operator}
                          onChange={(event) => {
                            const operator = event.target.value as TradeInConditionOperator;
                            updateCondition(selectedStep.id, {
                              ...selectedStep.condition,
                              operator,
                              value: operator === 'answered' ? '' : selectedStep.condition.value
                            });
                          }}
                        >
                          {operatorOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                        </select>
                      </label>

                      {selectedSourceField && (
                        <ConditionValueEditor
                          field={selectedSourceField}
                          condition={selectedStep.condition}
                          onChange={(condition) => updateCondition(selectedStep.id, condition)}
                        />
                      )}

                      <button
                        className="trade-in-logic-remove-condition"
                        type="button"
                        onClick={() => updateCondition(selectedStep.id, emptyTradeInCondition())}
                      >
                        <Icon name="delete" size={14} /> Прибрати умову
                      </button>
                    </>
                  )}
                </div>
              )}

              <section className="trade-in-logic-issues">
                <header><strong>Перевірка кроку</strong><span>{selectedIssues.length}</span></header>
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
        <span><i className="is-sequence" /> Пунктир — звичайна послідовність</span>
        <span><i className="is-condition" /> Фіолетова стрілка — умовний перехід</span>
        <span><i className="is-error" /> Червона стрілка — помилка залежності</span>
        <p>Один крок може мати одну вхідну умову. Це відповідає поточній моделі форми.</p>
      </footer>
    </div>
  );
}

export function TradeInLogicEditor(props: {
  config: TradeInConfig;
  mutate: (change: (next: TradeInConfig) => void) => void;
  onEditStep: (stepId: string) => void;
}) {
  return <ReactFlowProvider><TradeInLogicEditorCanvas {...props} /></ReactFlowProvider>;
}
