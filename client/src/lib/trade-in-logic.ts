import {
  createTradeInConditionGroup,
  emptyTradeInCondition,
  matchesTradeInConditionGroup,
  tradeInConditionGroup,
  tradeInId
} from './trade-in';
import type {
  TradeInAnswers,
  TradeInCondition,
  TradeInConditionBranch,
  TradeInConditionOperator,
  TradeInField,
  TradeInFormEdge,
  TradeInFormGraph,
  TradeInFormNode,
  TradeInFormNodePosition,
  TradeInFormNodeType,
  TradeInStep
} from '../types/trade-in';

export const tradeInConditionOperatorLabels: Record<TradeInConditionOperator, string> = {
  equals: 'дорівнює',
  not_equals: 'не дорівнює',
  one_of: 'одне зі значень',
  contains: 'містить',
  answered: 'заповнено',
  not_answered: 'не заповнено',
  greater_than: 'більше ніж',
  greater_or_equal: 'більше або дорівнює',
  less_than: 'менше ніж',
  less_or_equal: 'менше або дорівнює'
};

export interface TradeInLogicIssue {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  description: string;
  nodeId?: string;
  fieldKey?: string;
}

export interface TradeInResolvedNode {
  node: TradeInFormNode;
  traversedNodeIds: string[];
}

const nextHandle = 'next';
const defaultHandle = 'default';

function legacyConditionNode(step: TradeInStep, position: TradeInFormNodePosition): TradeInFormNode {
  return {
    id: `condition_${step.id}`,
    type: 'condition',
    position,
    title: `Умова: ${step.title}`,
    description: '',
    fields: [],
    branches: [{
      id: `branch_${step.id}`,
      label: 'Умова виконується',
      condition: structuredClone(step.condition),
      conditionGroup: createTradeInConditionGroup(structuredClone(step.condition))
    }],
    defaultBranchLabel: 'Інші випадки'
  };
}

export function convertTradeInStepsToGraph(
  steps: TradeInStep[],
  successTitle = 'Заявку прийнято',
  successText = 'Менеджер Mobile Trend звʼяжеться з вами найближчим часом.'
): TradeInFormGraph {
  const start: TradeInFormNode = {
    id: 'form_start',
    type: 'start',
    position: { x: 0, y: 180 },
    title: 'Початок',
    description: '',
    fields: [],
    branches: [],
    defaultBranchLabel: ''
  };
  const finish: TradeInFormNode = {
    id: 'form_finish',
    type: 'finish',
    position: { x: Math.max(1, steps.length + 1) * 360, y: 180 },
    title: successTitle,
    description: successText,
    fields: [],
    branches: [],
    defaultBranchLabel: ''
  };
  const fieldNodes = steps.map((step, index): TradeInFormNode => ({
    id: step.id,
    type: 'fields',
    position: { x: (index + 1) * 360, y: 180 },
    title: step.title,
    description: step.description,
    fields: structuredClone(step.fields),
    branches: [],
    defaultBranchLabel: ''
  }));
  const nodes: TradeInFormNode[] = [start, ...fieldNodes, finish];
  const edges: TradeInFormEdge[] = [];
  let nextEntryId = finish.id;

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const fieldNode = fieldNodes[index];
    edges.push({
      id: `edge_${fieldNode.id}_${nextEntryId}`,
      source: fieldNode.id,
      target: nextEntryId,
      sourceHandle: nextHandle
    });

    if (step.condition.fieldKey) {
      const conditionNode = legacyConditionNode(step, { x: fieldNode.position.x - 170, y: fieldNode.position.y + 250 });
      nodes.push(conditionNode);
      edges.push({
        id: `edge_${conditionNode.id}_${fieldNode.id}`,
        source: conditionNode.id,
        target: fieldNode.id,
        sourceHandle: conditionNode.branches[0].id
      });
      edges.push({
        id: `edge_${conditionNode.id}_${nextEntryId}_default`,
        source: conditionNode.id,
        target: nextEntryId,
        sourceHandle: defaultHandle
      });
      nextEntryId = conditionNode.id;
    } else {
      nextEntryId = fieldNode.id;
    }
  }

  edges.push({
    id: `edge_${start.id}_${nextEntryId}`,
    source: start.id,
    target: nextEntryId,
    sourceHandle: nextHandle
  });
  return { nodes, edges };
}

function normalizeTradeInGraphOutputs(graph: TradeInFormGraph): TradeInFormGraph {
  const latestEdgeByOutput = new Map<string, number>();
  graph.edges.forEach((edge, index) => {
    latestEdgeByOutput.set(`${edge.source}\u0000${edge.sourceHandle}`, index);
  });
  const edges = graph.edges.filter((edge, index) => (
    latestEdgeByOutput.get(`${edge.source}\u0000${edge.sourceHandle}`) === index
  ));
  return edges.length === graph.edges.length ? graph : { ...graph, edges };
}

export function getTradeInFormGraph(form: {
  graph?: TradeInFormGraph;
  steps: TradeInStep[];
  successTitle?: string;
  successText?: string;
}) {
  const graph = form.graph?.nodes?.length
    ? form.graph
    : convertTradeInStepsToGraph(form.steps || [], form.successTitle, form.successText);
  return normalizeTradeInGraphOutputs(graph);
}

export function createTradeInFormNode(
  type: Exclude<TradeInFormNodeType, 'start'>,
  position: TradeInFormNodePosition,
  index: number
): TradeInFormNode {
  const base = {
    id: tradeInId(`form_${type}`),
    type,
    position,
    title: '',
    description: '',
    fields: [] as TradeInField[],
    branches: [],
    defaultBranchLabel: ''
  };

  if (type === 'fields') {
    return {
      ...base,
      title: `Новий крок ${index + 1}`,
      description: 'Додайте поля, які має заповнити клієнт.'
    };
  }
  if (type === 'condition') {
    return {
      ...base,
      title: `Нова умова ${index + 1}`,
      description: 'Спрямуйте клієнта різними гілками залежно від відповіді.',
      branches: [{
        id: tradeInId('branch'),
        label: 'Варіант 1',
        condition: emptyTradeInCondition(),
        conditionGroup: createTradeInConditionGroup()
      }],
      defaultBranchLabel: 'Інші випадки'
    };
  }
  if (type === 'information') {
    return { ...base, title: 'Інформація', description: 'Додайте текст, який побачить клієнт.' };
  }
  return {
    ...base,
    title: 'Заявку прийнято',
    description: 'Менеджер Mobile Trend звʼяжеться з вами найближчим часом.'
  };
}

export function findNearestFreeNodePosition(
  nodes: TradeInFormNode[],
  desired: TradeInFormNodePosition,
  width = 300,
  height = 190
) {
  const grid = 40;
  const free = (position: TradeInFormNodePosition) => nodes.every((node) => (
    Math.abs(node.position.x - position.x) >= width || Math.abs(node.position.y - position.y) >= height
  ));
  const snapped = {
    x: Math.round(desired.x / grid) * grid,
    y: Math.round(desired.y / grid) * grid
  };
  if (free(snapped)) return snapped;

  for (let radius = 1; radius <= 20; radius += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      for (const y of [-radius, radius]) {
        const candidate = { x: snapped.x + x * grid, y: snapped.y + y * grid };
        if (free(candidate)) return candidate;
      }
    }
    for (let y = -radius + 1; y < radius; y += 1) {
      for (const x of [-radius, radius]) {
        const candidate = { x: snapped.x + x * grid, y: snapped.y + y * grid };
        if (free(candidate)) return candidate;
      }
    }
  }
  return { x: snapped.x + (nodes.length + 1) * grid, y: snapped.y + (nodes.length + 1) * grid };
}

export function getTradeInGraphFields(graph: TradeInFormGraph) {
  return graph.nodes.flatMap((node) => node.type === 'fields' ? node.fields : []);
}

export function getTradeInGraphFieldEntries(graph: TradeInFormGraph) {
  return graph.nodes.flatMap((node) => node.type === 'fields'
    ? node.fields.map((field) => ({
      nodeId: node.id,
      nodeTitle: node.title || 'Крок без назви',
      field
    }))
    : []);
}

export function formatTradeInCondition(graph: TradeInFormGraph, condition: TradeInCondition) {
  if (!condition.fieldKey) return 'Оберіть поле';
  const field = getTradeInGraphFields(graph).find((item) => item.key === condition.fieldKey);
  const fieldLabel = field?.label || condition.fieldKey;
  const operatorLabel = tradeInConditionOperatorLabels[condition.operator];
  if (condition.operator === 'answered' || condition.operator === 'not_answered') return `${fieldLabel} — ${operatorLabel}`;
  const values = condition.value.split(',').map((value) => value.trim()).filter(Boolean);
  const valueLabel = values.map((value) => field?.options.find((option) => option.value === value)?.label || value).join(', ');
  return `${fieldLabel} ${operatorLabel} ${valueLabel || '…'}`;
}

export function formatTradeInConditionBranch(graph: TradeInFormGraph, branch: TradeInConditionBranch) {
  const group = tradeInConditionGroup(branch);
  if (!group.conditions.length) return 'Додайте правило';
  const separator = group.combinator === 'any' ? ' АБО ' : ' І ';
  return group.conditions.map((condition) => formatTradeInCondition(graph, condition)).join(separator);
}

export function getTradeInOutgoingEdge(
  graph: TradeInFormGraph,
  nodeId: string,
  sourceHandle = nextHandle
) {
  return graph.edges.find((edge) => edge.source === nodeId && edge.sourceHandle === sourceHandle) || null;
}

export function connectTradeInGraph(
  graph: TradeInFormGraph,
  edge: TradeInFormEdge
): TradeInFormGraph {
  const target = graph.nodes.find((node) => node.id === edge.target);
  const acceptsMultipleIncoming = target?.type === 'fields' || target?.type === 'information';

  return {
    ...graph,
    edges: [
      ...graph.edges.filter((existing) => {
        const isSameConnection = existing.source === edge.source
          && existing.target === edge.target
          && existing.sourceHandle === edge.sourceHandle;
        const usesSameOutput = existing.source === edge.source
          && existing.sourceHandle === edge.sourceHandle;
        if (existing.id === edge.id || isSameConnection || usesSameOutput) return false;
        return acceptsMultipleIncoming || existing.target !== edge.target;
      }),
      edge
    ]
  };
}

export function getTradeInNextNodeId(graph: TradeInFormGraph, node: TradeInFormNode, answers: TradeInAnswers) {
  let sourceHandle = nextHandle;
  if (node.type === 'condition') {
    const matchingBranch = node.branches.find((branch) => (
      matchesTradeInConditionGroup(tradeInConditionGroup(branch), answers)
    ));
    sourceHandle = matchingBranch?.id || defaultHandle;
  }
  return getTradeInOutgoingEdge(graph, node.id, sourceHandle)?.target || null;
}

export function resolveNextTradeInDisplayNode(
  graph: TradeInFormGraph,
  fromNodeId: string,
  answers: TradeInAnswers
): TradeInResolvedNode | null {
  const traversedNodeIds: string[] = [];
  let current = graph.nodes.find((node) => node.id === fromNodeId) || null;
  if (!current) return null;

  for (let index = 0; index <= graph.nodes.length; index += 1) {
    const nextId = getTradeInNextNodeId(graph, current, answers);
    if (!nextId || traversedNodeIds.includes(nextId)) return null;
    const next = graph.nodes.find((node) => node.id === nextId) || null;
    if (!next) return null;
    traversedNodeIds.push(next.id);
    if (next.type === 'fields' || next.type === 'information' || next.type === 'finish') {
      return { node: next, traversedNodeIds };
    }
    current = next;
  }
  return null;
}

export function getTradeInInitialNode(graph: TradeInFormGraph, answers: TradeInAnswers) {
  const start = graph.nodes.find((node) => node.type === 'start');
  return start ? resolveNextTradeInDisplayNode(graph, start.id, answers) : null;
}

export function buildTradeInDisplayPath(graph: TradeInFormGraph, answers: TradeInAnswers) {
  const result: TradeInFormNode[] = [];
  const visited = new Set<string>();
  let resolved = getTradeInInitialNode(graph, answers);

  while (resolved?.node && !visited.has(resolved.node.id)) {
    const node = resolved.node;
    visited.add(node.id);
    result.push(node);
    if (node.type === 'finish') break;
    resolved = resolveNextTradeInDisplayNode(graph, node.id, answers);
  }
  return result;
}

export function validateTradeInLogic(graph: TradeInFormGraph) {
  const issues: TradeInLogicIssue[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const starts = graph.nodes.filter((node) => node.type === 'start');
  const finishes = graph.nodes.filter((node) => node.type === 'finish');
  const fields = getTradeInGraphFields(graph);
  const fieldNodes = new Map<string, TradeInFormNode>();

  graph.nodes.forEach((node) => {
    if (node.type === 'fields') node.fields.forEach((field) => fieldNodes.set(field.id, node));
  });

  if (starts.length !== 1) {
    issues.push({
      id: 'start-count',
      severity: 'error',
      title: 'Потрібна одна стартова нода',
      description: `Знайдено стартових нод: ${starts.length}.`
    });
  }
  if (!finishes.length) {
    issues.push({
      id: 'finish-count',
      severity: 'error',
      title: 'Немає завершення',
      description: 'Додайте ноду завершення, яка відправлятиме заявку.'
    });
  }

  const keyGroups = new Map<string, TradeInField[]>();
  fields.forEach((field) => {
    const key = field.key.trim();
    if (!key) {
      issues.push({
        id: `empty-key-${field.id}`,
        severity: 'error',
        title: 'Поле без ключа',
        description: `Поле «${field.label || 'Без назви'}» не можна використати в умовах.`,
        nodeId: fieldNodes.get(field.id)?.id
      });
      return;
    }
    keyGroups.set(key, [...(keyGroups.get(key) || []), field]);
  });
  keyGroups.forEach((group, key) => {
    if (group.length < 2) return;
    issues.push({
      id: `duplicate-key-${key}`,
      severity: 'error',
      title: 'Неунікальний ключ поля',
      description: `Ключ «${key}» використовується ${group.length} рази.`,
      nodeId: fieldNodes.get(group[0].id)?.id,
      fieldKey: key
    });
  });

  graph.edges.forEach((edge) => {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      issues.push({
        id: `broken-edge-${edge.id}`,
        severity: 'error',
        title: 'Пошкоджений зв’язок',
        description: 'Початкова або кінцева нода цього зв’язку не існує.'
      });
    }
  });

  graph.nodes.forEach((node) => {
    const outgoing = graph.edges.filter((edge) => edge.source === node.id);
    if (node.type === 'finish' && outgoing.length) {
      issues.push({
        id: `finish-outgoing-${node.id}`,
        severity: 'error',
        title: 'Завершення має вихідний зв’язок',
        description: 'Після відправлення заявки сценарій повинен завершуватися.',
        nodeId: node.id
      });
    }
    if (['start', 'fields', 'information'].includes(node.type)) {
      const nextEdges = outgoing.filter((edge) => edge.sourceHandle === nextHandle);
      if (!nextEdges.length) {
        issues.push({
          id: `missing-next-${node.id}`,
          severity: 'error',
          title: 'Немає наступного кроку',
          description: `Нода «${node.title || node.type}» не має вихідного зв’язку.`,
          nodeId: node.id
        });
      }
      if (nextEdges.length > 1) {
        issues.push({
          id: `multiple-next-${node.id}`,
          severity: 'error',
          title: 'Забагато вихідних зв’язків',
          description: 'Звичайна нода може мати лише один наступний крок.',
          nodeId: node.id
        });
      }
    }
    if (node.type === 'condition') {
      node.branches.forEach((branch) => {
        const group = tradeInConditionGroup(branch);
        if (!group.conditions.length) {
          issues.push({
            id: `empty-branch-${node.id}-${branch.id}`,
            severity: 'error',
            title: 'Гілка без умови',
            description: `У гілці «${branch.label || 'Без назви'}» немає жодного правила.`,
            nodeId: node.id
          });
        }
        group.conditions.forEach((condition, conditionIndex) => {
          if (!condition.fieldKey) {
            issues.push({
              id: `empty-branch-rule-${node.id}-${branch.id}-${conditionIndex}`,
              severity: 'error',
              title: 'Правило без поля',
              description: `Оберіть поле у правилі ${conditionIndex + 1} гілки «${branch.label || 'Без назви'}».`,
              nodeId: node.id
            });
          } else if (!keyGroups.has(condition.fieldKey)) {
            issues.push({
              id: `missing-branch-field-${node.id}-${branch.id}-${conditionIndex}`,
              severity: 'error',
              title: 'Поле умови не існує',
              description: `Гілка посилається на поле «${condition.fieldKey}».`,
              nodeId: node.id,
              fieldKey: condition.fieldKey
            });
          } else if (
            !['answered', 'not_answered'].includes(condition.operator)
            && !condition.value.trim()
          ) {
            issues.push({
              id: `empty-branch-value-${node.id}-${branch.id}-${conditionIndex}`,
              severity: 'error',
              title: 'Не вказано значення',
              description: `Заповніть значення у правилі ${conditionIndex + 1} гілки «${branch.label || 'Без назви'}».`,
              nodeId: node.id,
              fieldKey: condition.fieldKey
            });
          }
        });
        if (!outgoing.some((edge) => edge.sourceHandle === branch.id)) {
          issues.push({
            id: `missing-branch-edge-${node.id}-${branch.id}`,
            severity: 'error',
            title: 'Гілка нікуди не веде',
            description: `Під’єднайте вихід «${branch.label || 'Без назви'}» до наступної ноди.`,
            nodeId: node.id
          });
        }
      });
      if (!outgoing.some((edge) => edge.sourceHandle === defaultHandle)) {
        issues.push({
          id: `missing-default-edge-${node.id}`,
          severity: 'warning',
          title: 'Немає резервного переходу',
          description: 'Додайте вихід «Інші випадки», щоб форма не зупинилася.',
          nodeId: node.id
        });
      }
    }
  });

  const reachable = new Set<string>();
  const queue = starts[0] ? [starts[0].id] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    graph.edges.filter((edge) => edge.source === id).forEach((edge) => queue.push(edge.target));
  }
  graph.nodes.forEach((node) => {
    if (!reachable.has(node.id)) {
      issues.push({
        id: `unreachable-${node.id}`,
        severity: 'warning',
        title: 'Нода недосяжна',
        description: `До ноди «${node.title || node.type}» немає шляху від початку.`,
        nodeId: node.id
      });
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const findCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    const cyclic = graph.edges.filter((edge) => edge.source === nodeId).some((edge) => findCycle(edge.target));
    visiting.delete(nodeId);
    visited.add(nodeId);
    return cyclic;
  };
  if (starts[0] && findCycle(starts[0].id)) {
    issues.push({
      id: 'cycle',
      severity: 'error',
      title: 'У сценарії є цикл',
      description: 'Кроки форми не можуть повертати клієнта у нескінченне коло.'
    });
  }
  return issues;
}

export function canConnectTradeInGraph(
  graph: TradeInFormGraph,
  sourceId: string,
  targetId: string,
  _sourceHandle: string
) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const source = graph.nodes.find((node) => node.id === sourceId);
  const target = graph.nodes.find((node) => node.id === targetId);
  if (!source || !target || source.type === 'finish' || target.type === 'start') return false;

  const adjacency = new Map<string, string[]>();
  graph.edges.forEach((edge) => adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]));
  const queue = [targetId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === sourceId) return false;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) || []));
  }
  return true;
}

export function removeTradeInGraphNode(graph: TradeInFormGraph, nodeId: string) {
  return {
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
  };
}
