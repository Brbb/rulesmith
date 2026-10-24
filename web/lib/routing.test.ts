import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRouting, resolvedRouting } from "./routing";
import type { Policy } from "./types";
const legacy: Policy = {
  version: 1,
  id: "routing",
  name: "Routing",
  description: "",
  inputSchema: {},
  stages: [
    {
      id: "calculate",
      name: "Calculate",
      kind: "transform",
      outputs: { value: { type: "number" } },
      expressions: { value: "10" },
      explanation: "",
    },
    {
      id: "pass",
      name: "Pass",
      kind: "decision",
      outcome: "PASS",
      explanation: "",
    },
    {
      id: "flag",
      name: "Flag",
      kind: "decision",
      outcome: "FLAG",
      explanation: "",
    },
  ],
  edges: [
    {
      id: "yes",
      from: "calculate",
      to: "pass",
      condition: "stages.calculate.value >= 10",
      label: "High",
    },
    {
      id: "no",
      from: "calculate",
      to: "flag",
      condition: "stages.calculate.value < 10",
      label: "Low",
    },
  ],
};
test("legacy predicates move into a separate router without changing computations or destinations", () => {
  const before = JSON.stringify(legacy),
    policy = normalizeRouting(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(policy.stages.length, 4);
  assert.deepEqual(policy.stages[0], legacy.stages[0]);
  const router = policy.stages[3];
  assert.equal(router.kind, "switch");
  assert.equal(router.routing, "exclusive");
  assert.deepEqual(
    router.cases,
    legacy.edges.map(({ from, to, ...item }) => ({
      ...item,
      rules: undefined,
      order: undefined,
      default: undefined,
    })),
  );
  assert.deepEqual(
    policy.edges.filter((edge) => edge.from === router.id),
    legacy.edges.map((edge) => ({ id: edge.id, from: router.id, to: edge.to })),
  );
  assert.equal(
    policy.edges.filter((edge) => edge.from === "calculate").length,
    1,
  );
  assert.deepEqual(normalizeRouting(policy), policy);
});
test("legacy Switch keeps first-match mode and case order and only plain links are persisted", () => {
  const source: Policy = {
    ...legacy,
    stages: [
      {
        ...legacy.stages[0],
        kind: "switch",
        expressions: undefined,
        outputs: undefined,
      },
      ...legacy.stages.slice(1),
    ],
    edges: [
      { ...legacy.edges[0], order: 3 },
      { ...legacy.edges[1], condition: undefined, default: true },
    ],
  };
  const policy = normalizeRouting(source);
  assert.equal(policy.stages.length, 3);
  assert.equal(policy.stages[0].routing, undefined);
  assert.equal(policy.stages[0].cases?.[0].order, 3);
  assert.equal(policy.stages[0].cases?.[1].default, true);
  assert.deepEqual(
    policy.edges,
    source.edges.map(({ id, from, to }) => ({ id, from, to })),
  );
  assert.equal(
    resolvedRouting(policy).edges[0].condition,
    source.edges[0].condition,
  );
  assert.deepEqual(normalizeRouting(resolvedRouting(policy)), policy);
});
test("editing prose updates its owning case and unconditional links never acquire predicates", () => {
  const policy = normalizeRouting(legacy),
    view = resolvedRouting(policy);
  view.edges[0] = { ...view.edges[0], condition: "false" };
  const updated = normalizeRouting(view);
  assert.equal(updated.stages[3].cases?.[0].condition, "false");
  assert.equal(updated.edges[0].condition, undefined);
  const simple = normalizeRouting({
    ...legacy,
    edges: [{ id: "next", from: "calculate", to: "pass", condition: "true" }],
  });
  assert.equal(simple.stages.length, 3);
  assert.equal(simple.edges[0].condition, undefined);
});
test("migration avoids existing stage and edge IDs", () => {
  const policy = normalizeRouting({
    ...legacy,
    stages: [
      ...legacy.stages,
      { ...legacy.stages[1], id: "calculate_routing" },
    ],
    edges: [
      ...legacy.edges,
      { id: "calculate_routing__input", from: "pass", to: "flag" },
    ],
  });
  assert.equal(
    new Set(policy.stages.map((stage) => stage.id)).size,
    policy.stages.length,
  );
  assert.equal(
    new Set(policy.edges.map((edge) => edge.id)).size,
    policy.edges.length,
  );
});
