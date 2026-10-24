import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addConnectedStage,
  connectStages,
  makeStage,
  newBranchHandle,
  terminalOutcomes,
} from "./canvas-actions";
import { normalizeRouting } from "./routing";
import type { Policy } from "./types";
const base = (): Policy => ({
  version: 1,
  id: "canvas",
  name: "Canvas",
  description: "",
  inputSchema: {},
  stages: [
    {
      id: "route",
      name: "Route",
      kind: "switch",
      explanation: "",
      cases: [
        { id: "first", condition: "true", label: "First" },
        { id: "second", condition: "false", label: "New branch" },
      ],
    },
    {
      id: "done",
      name: "Done",
      kind: "decision",
      outcome: "PASS",
      explanation: "",
    },
  ],
  edges: [{ id: "first", from: "route", to: "done" }],
});
test("new unconnected cases survive normalization and can be connected without reloading", () => {
  const draft = normalizeRouting(base());
  assert.equal(draft.stages[0].cases?.length, 2);
  const result = connectStages(draft, "route", "done", "second");
  assert.deepEqual(
    result.edges.find((edge) => edge.id === "second"),
    { id: "second", from: "route", to: "done" },
  );
  assert.equal(base().edges.length, 1);
  assert.deepEqual(normalizeRouting(result), result);
});
test("choosing a block creates and connects every supported kind in one definition update", () => {
  for (const kind of [
    "transform",
    "if",
    "switch",
    "javascript",
    "decision",
  ] as const) {
    const policy = base(),
      before = JSON.stringify(policy),
      result = addConnectedStage(
        policy,
        "route",
        "second",
        kind,
        kind === "decision" ? "REJECT" : undefined,
      );
    assert.equal(result.policy.stages.length, policy.stages.length + 1);
    assert.equal(
      result.policy.stages.find((stage) => stage.id === result.id)?.kind,
      kind,
    );
    assert.equal(
      result.policy.edges.find((edge) => edge.id === "second")?.to,
      result.id,
    );
    assert.equal(JSON.stringify(policy), before);
    if (kind === "decision")
      assert.equal(
        result.policy.stages.find((stage) => stage.id === result.id)?.outcome,
        "REJECT",
      );
    if (kind === "if" || kind === "switch")
      assert.equal(
        normalizeRouting(result.policy).stages.find(
          (stage) => stage.id === result.id,
        )?.cases?.length,
        2,
      );
  }
});
test("retargeting uses the same case ID and disposes only of an unused generated placeholder", () => {
  const policy = base();
  policy.stages.push(makeStage("decision", "decision_generated"));
  policy.edges.push({ id: "second", from: "route", to: "decision_generated" });
  const result = connectStages(policy, "route", "done", "second", "replace");
  assert.equal(result.edges.filter((edge) => edge.id === "second").length, 1);
  assert.ok(!result.stages.some((stage) => stage.id === "decision_generated"));
  policy.edges.push({ id: "shared", from: "other", to: "decision_generated" });
  assert.ok(
    connectStages(policy, "route", "done", "second", "replace").stages.some(
      (stage) => stage.id === "decision_generated",
    ),
  );
});
test("ordinary blocks connect once and invalid sources, handles, self-links and cycles fail closed", () => {
  const policy = base();
  policy.stages.push(makeStage("transform", "compute"));
  const linked = connectStages(policy, "compute", "route");
  assert.ok(
    linked.edges.some((edge) => edge.from === "compute" && edge.to === "route"),
  );
  assert.throws(() => connectStages(linked, "compute", "done"), /already has/);
  assert.throws(
    () => connectStages(linked, "route", "compute", "second"),
    /cycle/,
  );
  assert.throws(
    () => connectStages(policy, "route", "route", "second"),
    /cycle/,
  );
  assert.throws(
    () => connectStages(policy, "route", "done", "missing"),
    /connector/,
  );
  assert.throws(
    () => connectStages(policy, "done", "route"),
    /end the workflow/,
  );
});
test("terminal decision choices include REJECT and exclude execution errors", () => {
  assert.deepEqual(terminalOutcomes, ["PASS", "REJECT", "FLAG", "UNKNOWN"]);
  for (const outcome of terminalOutcomes)
    assert.equal(makeStage("decision", "decision", outcome).outcome, outcome);
});

test("fifth and later arrows preserve every existing connection including insufficient evidence", () => {
  let policy = base();
  policy.stages.push({
    ...makeStage("decision", "unknown", "UNKNOWN"),
    name: "Insufficient evidence",
  });
  policy.stages[0].cases!.push(
    { id: "evidence", label: "Insufficient evidence", condition: "false" },
    { id: "fallback", label: "Otherwise", default: true },
  );
  policy.edges.push(
    { id: "evidence", from: "route", to: "unknown" },
    { id: "fallback", from: "route", to: "done" },
  );
  const originals = structuredClone(policy.edges);
  for (let index = 0; index < 8; index++) {
    const before = JSON.stringify(policy),
      start = index % 2 ? "evidence" : newBranchHandle(policy.stages[0]);
    const next = addConnectedStage(
      policy,
      "route",
      start,
      "decision",
      index % 2 ? "REJECT" : "FLAG",
    );
    assert.equal(JSON.stringify(policy), before);
    assert.equal(next.policy.edges.length, policy.edges.length + 1);
    for (const edge of originals)
      assert.deepEqual(
        next.policy.edges.find((item) => item.id === edge.id),
        edge,
      );
    assert.equal(
      next.policy.stages.find((stage) => stage.id === "unknown")?.name,
      "Insufficient evidence",
    );
    const edge = next.policy.edges.find((edge) => edge.to === next.id)!;
    assert.notEqual(edge.id, "evidence");
    assert.equal(
      next.policy.stages[0].cases?.find((item) => item.id === edge.id)
        ?.condition,
      "false",
    );
    policy = normalizeRouting(next.policy);
  }
  assert.equal(
    policy.stages[0].cases?.filter((item) => item.default).length,
    1,
  );
});
test("dragging from an occupied case to an existing target adds a case; explicit destination edits replace", () => {
  const policy = base();
  policy.stages.push(makeStage("decision", "unknown", "UNKNOWN"));
  const added = connectStages(policy, "route", "unknown", "first");
  assert.deepEqual(
    added.edges.find((edge) => edge.id === "first"),
    policy.edges[0],
  );
  assert.equal(added.edges.length, 2);
  assert.equal(added.stages[0].cases?.length, 3);
  const replaced = connectStages(
    policy,
    "route",
    "unknown",
    "first",
    "replace",
  );
  assert.equal(replaced.edges.length, 1);
  assert.equal(replaced.edges[0].to, "unknown");
  assert.equal(replaced.stages[0].cases?.length, 2);
});
test("occupied IF paths cannot silently detach destinations during canvas drags", () => {
  const policy = base();
  policy.stages[0].kind = "if";
  policy.stages.push(makeStage("decision", "unknown", "UNKNOWN"));
  assert.throws(
    () => connectStages(policy, "route", "unknown", "first"),
    /case editor/,
  );
  assert.deepEqual(
    connectStages(policy, "route", "unknown", "first", "replace").edges,
    [{ id: "first", from: "route", to: "unknown" }],
  );
});
