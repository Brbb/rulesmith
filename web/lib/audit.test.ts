import { test } from "node:test";
import assert from "node:assert/strict";
import { auditIntent, filterRuns, findRun, recordRun } from "./audit";
import type { Policy, Run } from "./types";
const policy: Policy = {
  version: 1,
  id: "eligibility",
  name: "Eligibility",
  description: "",
  inputSchema: {},
  stages: [],
  edges: [],
};
const result: Run = {
  policyId: "eligibility",
  outcome: "FLAG",
  explanation: "Threshold failed",
  trace: [],
};
test("run records retain independent policy, input and trace snapshots", () => {
  const input = { age: 20 };
  const p = structuredClone(policy),
    run = structuredClone(result);
  const record = recordRun(p, input, run, "original");
  p.name = "Changed";
  input.age = 30;
  run.outcome = "PASS";
  assert.equal(record.policy.name, "Eligibility");
  assert.equal(record.input.age, 20);
  assert.equal(record.result.outcome, "FLAG");
  assert.equal(record.replayOf, "original");
});
test("run lookup rejects ambiguous IDs and never silently replays the wrong snapshot", () => {
  const a = { ...recordRun(policy, {}, result), id: "abc12345" },
    b = { ...a, id: "abc56789" };
  assert.equal(findRun([a, b], "abc"), undefined);
  assert.equal(findRun([a, b], "#abc123"), a);
  assert.equal(findRun([a, b], "last"), a);
  assert.equal(findRun([], "last"), undefined);
  assert.deepEqual(filterRuns([a], "flag"), [a]);
  assert.deepEqual(filterRuns([a], "PASS"), []);
});
test("audit commands are explicit and do not intercept policy authoring", () => {
  assert.deepEqual(auditIntent("/replay #abc123"), {
    kind: "replay",
    target: "#abc123",
  });
  assert.deepEqual(auditIntent("Explain this run"), {
    kind: "audit",
    target: "last",
  });
  assert.deepEqual(auditIntent("/runs FLAG"), { kind: "runs", target: "FLAG" });
  assert.equal(
    auditIntent("Create a policy that flags failed runs"),
    undefined,
  );
  assert.equal(auditIntent("Explain the policy"), undefined);
  assert.deepEqual(auditIntent("Show flagged runs"), {
    kind: "runs",
    target: "FLAG",
  });
  assert.deepEqual(auditIntent("Why did the last run fail?"), {
    kind: "audit",
    target: "last",
  });
});
