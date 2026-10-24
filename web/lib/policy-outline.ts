import { resolvedRouting, isRouter } from "./routing";
import type { Policy, Stage } from "./types";

/** List shared stages once, after their predecessors; retain malformed drafts for editing. */
export function orderedStages(policy: Policy): Stage[] {
  const remaining = [...policy.stages];
  const ordered: Stage[] = [];
  while (remaining.length) {
    const next = remaining.findIndex((stage) =>
      policy.edges
        .filter((edge) => edge.to === stage.id)
        .every((edge) => ordered.some((parent) => parent.id === edge.from)),
    );
    if (next < 0) return [...ordered, ...remaining];
    ordered.push(...remaining.splice(next, 1));
  }
  return ordered;
}
export function stageRoutes(policy: Policy, stage: Stage) {
  return resolvedRouting(policy)
    .edges.filter((edge) => edge.from === stage.id)
    .sort((a, b) =>
      isRouter(stage)
        ? Number(!!a.default) - Number(!!b.default) ||
          (a.order || 0) - (b.order || 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    );
}
