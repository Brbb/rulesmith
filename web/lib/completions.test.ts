import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  completionContext,
  insertCompletion,
  matchingCompletions,
  payloadCompletions,
  stageCompletions,
  upstreamStages,
  shouldSuggest,
} from "./completions";
import type { Policy } from "./types";

test("payload fields include nested paths, array members, types, and actual values", () => {
  const { items, valid } = payloadCompletions(
    JSON.stringify({
      amount: 25,
      customer: { active: true },
      items: [{ sku: "A-1" }],
      empty: [],
      nothing: null,
    }),
  );
  assert.equal(valid, true);
  const field = (path: string) => items.find((i) => i.path === path);
  assert.equal(field("input.amount")?.type, "number");
  assert.equal(field("input.amount")?.preview, "25");
  assert.equal(field("input.customer.active")?.type, "boolean");
  assert.equal(field("input.items[0].sku")?.preview, '"A-1"');
  assert.equal(field("input.empty[0]"), undefined);
  assert.equal(field("input.nothing")?.type, "null");
});
test("unusual property names are valid Expr bracket paths", () => {
  const { items } = payloadCompletions(
    '{"risk-score":2,"customer":{"full name":"A"}}',
  );
  assert.ok(items.some((i) => i.path === 'input["risk-score"]'));
  assert.ok(items.some((i) => i.path === 'input.customer["full name"]'));
});
test("invalid, null, and nonobject payloads fall back to schema without old payload fields", () => {
  for (const text of ["{broken", "null", "[]", "42"]) {
    const { items, valid } = payloadCompletions(text, {
      value: { type: "number", required: true },
    });
    assert.equal(valid, false);
    assert.deepEqual(items, [
      {
        path: "input.value",
        type: "number",
        preview: "not in test payload",
        source: "schema",
      },
    ]);
  }
});
test("payload values win over schema previews and missing declared fields stay available", () => {
  const { items } = payloadCompletions('{"value":42}', {
    value: { type: "number" },
    other: { type: "boolean" },
  });
  assert.equal(items.length, 2);
  assert.equal(items.find((i) => i.path === "input.value")?.source, "payload");
  assert.equal(items.find((i) => i.path === "input.other")?.source, "schema");
});
test("changing test data immediately changes available suggestions", () => {
  assert.deepEqual(
    payloadCompletions('{"newField":true}').items.map((i) => i.path),
    ["input.newField"],
  );
});
test("autocomplete replaces only the token at the caret and preserves trailing expression", () => {
  const value = "input.va > 25 && input.active";
  const context = completionContext(value, 8);
  const result = insertCompletion(value, context, "input.value");
  assert.equal(result.value, "input.value > 25 && input.active");
  assert.equal(result.caret, 11);
});
test("editing in the middle of an existing token replaces its remainder", () => {
  const value = "input.value >= 1";
  const context = completionContext(value, 8);
  assert.equal(
    insertCompletion(value, context, "input.vendor").value,
    "input.vendor >= 1",
  );
});
test("suggestions filter nested paths and support keyboard completion from an empty expression", () => {
  const items = payloadCompletions('{"customer":{"name":"A"},"count":2}').items;
  assert.deepEqual(
    matchingCompletions(items, completionContext("input.customer.n", 16)).map(
      (i) => i.path,
    ),
    ["input.customer.name"],
  );
  assert.equal(matchingCompletions(items, completionContext("", 0)).length, 3);
});
test("input discovery has finite depth and suggestion limits", () => {
  const obj = Object.fromEntries(
    Array.from({ length: 400 }, (_, i) => ["key" + i, i]),
  );
  const { items } = payloadCompletions(JSON.stringify(obj));
  assert.equal(items.length, 300);
  assert.equal(
    matchingCompletions(items, { start: 0, end: 0, prefix: "input." }).length,
    12,
  );
});
const policy: Policy = {
  version: 1,
  id: "test",
  name: "test",
  description: "",
  inputSchema: {},
  stages: [
    {
      id: "first",
      name: "First",
      kind: "transform",
      outputs: { amount: { type: "number" } },
      explanation: "",
    },
    {
      id: "second",
      name: "Second",
      kind: "transform",
      outputs: { valid: { type: "boolean" } },
      explanation: "",
    },
    {
      id: "last",
      name: "Last",
      kind: "decision",
      outcome: "PASS",
      explanation: "",
    },
  ],
  edges: [
    { id: "a", from: "first", to: "second" },
    { id: "b", from: "second", to: "last" },
  ],
};
test("stage expressions exclude their own outputs and future stages", () => {
  assert.deepEqual(
    upstreamStages(policy, "second", false).map((s) => s.id),
    ["first"],
  );
  assert.deepEqual(
    stageCompletions(upstreamStages(policy, "second", false)).map(
      (i) => i.path,
    ),
    ["stages.first.amount"],
  );
});
test("conditions can complete source-stage outputs and all ancestors", () => {
  assert.deepEqual(
    upstreamStages(policy, "second", true).map((s) => s.id),
    ["first", "second"],
  );
  assert.equal(
    stageCompletions(upstreamStages(policy, "second", true)).find(
      (i) => i.path === "stages.second.valid",
    )?.type,
    "boolean",
  );
});
test("editing a temporarily cyclic graph cannot hang scope discovery", () => {
  const cyclic = {
    ...policy,
    edges: [...policy.edges, { id: "cycle", from: "second", to: "first" }],
  };
  assert.deepEqual(
    upstreamStages(cyclic, "second", false).map((s) => s.id),
    ["first"],
  );
});

test("numeric literals do not trigger field completion unless explicitly requested", () => {
  const value = "input.value > 50000";
  const context = completionContext(value, value.length);
  assert.equal(shouldSuggest(value, value.length, context), false);
  assert.equal(shouldSuggest(value, value.length, context, true), true);
  assert.equal(shouldSuggest("", 0, completionContext("", 0)), true);
});

test("dot-prefix search still inserts safe bracket accessors for unusual keys", () => {
  const items = payloadCompletions('{"risk-score":42,"full name":"A"}').items;
  assert.equal(
    matchingCompletions(items, completionContext("input.r", 7))[0]?.path,
    'input["risk-score"]',
  );
  assert.equal(
    matchingCompletions(items, completionContext("input.", 6)).length,
    2,
  );
});
