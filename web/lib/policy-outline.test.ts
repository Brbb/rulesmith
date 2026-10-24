import { test } from "node:test";
import assert from "node:assert/strict";
import { orderedStages, stageRoutes } from "./policy-outline";
import type { Policy, Stage } from "./types";
const stage = (id: string, kind: Stage["kind"] = "transform"): Stage => ({
  id,
  kind,
  name: id,
  explanation: "",
});
const base: Policy = {
  id: "example",
  version: 1,
  name: "Example",
  description: "",
  inputSchema: {},
  stages: [],
  edges: [],
};
test("whole-policy view lists shared stages once, after every predecessor", () => {
  const policy: Policy = {
    ...base,
    stages: [
      stage("end", "decision"),
      stage("right"),
      stage("merge"),
      stage("root"),
      stage("left"),
    ],
    edges: [
      { id: "a", from: "root", to: "left" },
      { id: "b", from: "root", to: "right" },
      { id: "c", from: "left", to: "merge" },
      { id: "d", from: "right", to: "merge" },
      { id: "e", from: "merge", to: "end" },
    ],
  };
  const ids = orderedStages(policy).map((item) => item.id);
  assert.equal(ids[0], "root");
  assert.equal(ids.at(-1), "end");
  assert.ok(ids.indexOf("merge") > ids.indexOf("left"));
  assert.ok(ids.indexOf("merge") > ids.indexOf("right"));
  assert.equal(new Set(ids).size, policy.stages.length);
  assert.equal(policy.stages[0].id, "end");
});
test("switch sentences follow runtime priority and fallback order, including ID tie breaks", () => {
  const source = stage("root", "switch");
  const policy: Policy = {
    ...base,
    stages: [source],
    edges: [
      { id: "fallback", from: "root", to: "end", default: true, order: -1 },
      { id: "a", from: "root", to: "end", order: 2 },
      { id: "Z", from: "root", to: "end", order: 2 },
      { id: "first", from: "root", to: "end", order: 1 },
    ],
  };
  assert.deepEqual(
    stageRoutes(policy, source).map((edge) => edge.id),
    ["first", "Z", "a", "fallback"],
  );
  assert.deepEqual(
    stageRoutes(policy, { ...source, kind: "transform" }).map(
      (edge) => edge.id,
    ),
    ["Z", "a", "fallback", "first"],
  );
});
test("temporarily cyclic drafts remain fully visible without hanging", () => {
  const policy: Policy = {
    ...base,
    stages: [stage("a"), stage("b")],
    edges: [
      { id: "ab", from: "a", to: "b" },
      { id: "ba", from: "b", to: "a" },
    ],
  };
  assert.deepEqual(
    orderedStages(policy).map((item) => item.id),
    ["a", "b"],
  );
});
