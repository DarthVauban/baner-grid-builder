export function workflowSummarySettings(workflow = {}) {
  const graphNodes = workflow.graph?.nodes || [];
  const fields = graphNodes.length
    ? graphNodes.flatMap((node) => node.fields || [])
    : (workflow.steps || []).flatMap((step) => step.fields || []);
  return fields.map((field) => ({
    key: field.key,
    showInSummary: field.showInSummary === true
  }));
}
