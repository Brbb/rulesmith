import type { Policy, PolicyEdge, RoutingCase, Stage } from "./types";
export const isRouter = (stage?: Stage) =>
  stage?.kind === "switch" || stage?.kind === "if";
const conditional = (edge: PolicyEdge) =>
  !!edge.rules ||
  !!edge.default ||
  (!!edge.condition?.trim() && edge.condition.trim() !== "true");
export function routingCase(edge: PolicyEdge): RoutingCase {
  return {
    id: edge.id,
    label: edge.label,
    condition: edge.condition,
    rules: edge.rules,
    order: edge.order,
    default: edge.default,
  };
}
/** Convert legacy edge predicates into block-owned cases, retaining IDs and strict ambiguity semantics. */
export function normalizeRouting(policy: Policy): Policy {
  let stages = policy.stages.map((stage) => ({ ...stage }));
  let edges = policy.edges.map((edge) => ({ ...edge }));
  const ids = new Set(stages.map((stage) => stage.id));
  for (const stage of [...stages]) {
    const outgoing = edges.filter((edge) => edge.from === stage.id);
    if (
      !isRouter(stage) &&
      (outgoing.some(conditional) || outgoing.length > 1)
    ) {
      let id = `${stage.id}_routing`;
      while (ids.has(id)) id += "_";
      ids.add(id);
      const router: Stage = {
        id,
        kind: "switch",
        name: `${stage.name} routing`,
        routing: "exclusive",
        explanation: "Exactly one case must match.",
        cases: outgoing.map(routingCase),
      };
      stages.push(router);
      edges = edges.map((edge) =>
        edge.from === stage.id ? { id: edge.id, from: id, to: edge.to } : edge,
      );
      let connector = `${id}_input`;
      while (edges.some((edge) => edge.id === connector)) connector += "_";
      edges.push({ id: connector, from: stage.id, to: id });
    } else if (isRouter(stage)) {
      const cases = [...(stage.cases || [])];
      for (const edge of outgoing) {
        const index = cases.findIndex((item) => item.id === edge.id);
        const hasDefinition =
          edge.condition !== undefined ||
          edge.rules !== undefined ||
          edge.default !== undefined ||
          edge.order !== undefined ||
          edge.label !== undefined;
        if (index < 0) cases.push(routingCase(edge));
        else if (hasDefinition)
          cases[index] = { ...cases[index], ...routingCase(edge) };
      }
      stage.cases = cases;
      edges = edges.map((edge) =>
        edge.from === stage.id
          ? { id: edge.id, from: edge.from, to: edge.to }
          : edge,
      );
    } else {
      edges = edges.map((edge) =>
        edge.from === stage.id
          ? {
              id: edge.id,
              from: edge.from,
              to: edge.to,
              ...(edge.label ? { label: edge.label } : {}),
            }
          : edge,
      );
    }
  }
  return { ...policy, stages, edges };
}
/** Presentation-only projection for prose editors and audit labels; never persisted. */
export function resolvedRouting(policy: Policy): Policy {
  return {
    ...policy,
    edges: policy.edges.map((edge) => ({
      ...edge,
      ...policy.stages
        .find((stage) => stage.id === edge.from)
        ?.cases?.find((item) => item.id === edge.id),
    })),
  };
}
