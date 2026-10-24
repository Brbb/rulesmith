import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  compileRules,
  edgeExpression,
  routeLabel,
  ruleSentence,
  parseSimpleCondition,
} from "./rules";
import type { Policy, RuleGroup } from "./types";
const group: RuleGroup = {
  match: "all",
  clauses: [
    { field: "input.age", operator: "gte", value: 21 },
    { field: "input.monthlyIncome", operator: "gt", value: 4000 },
  ],
};
test("sentence edits compile to executable conditions rather than a description", () => {
  assert.equal(
    compileRules(group),
    "(input.age >= 21) && (input.monthlyIncome > 4000)",
  );
  assert.equal(
    compileRules({ ...group, match: "any" }),
    "(input.age >= 21) || (input.monthlyIncome > 4000)",
  );
});
test("rule literals are escaped and exists compiles to a nil check", () => {
  assert.equal(
    compileRules({
      match: "all",
      clauses: [
        { field: "input.name", operator: "eq", value: 'a"b' },
        { field: "input.name", operator: "exists" },
      ],
    }),
    '(input.name == "a\\"b") && (input.name != nil)',
  );
});
test("canvas labels are independent of expressions", () => {
  const p = { stages: [{ id: "yes", name: "Approve" }] } as unknown as Policy;
  assert.equal(
    routeLabel(
      {
        id: "a",
        from: "switch",
        to: "yes",
        label: "Eligible",
        condition: "input.age>=21",
      },
      p,
    ),
    "Eligible",
  );
  assert.equal(
    routeLabel(
      { id: "a", from: "switch", to: "yes", condition: "input.age>=21" },
      p,
    ),
    "Route to Approve",
  );
});
test("structured, advanced and fallback edge conditions render consistently", () => {
  assert.equal(
    edgeExpression({ id: "a", from: "s", to: "yes", rules: group }),
    compileRules(group),
  );
  assert.equal(
    edgeExpression({ id: "b", from: "s", to: "no", default: true }),
    "otherwise",
  );
});
test("readable prose is derived from rules and field labels", () => {
  const p = {
    inputSchema: {
      age: { type: "number", label: "Applicant age" },
      monthlyIncome: { type: "number", label: "Monthly income" },
    },
  } as unknown as Policy;
  assert.equal(
    ruleSentence(group, p),
    "Applicant age is at least 21 and Monthly income is greater than 4000",
  );
});

test("simple legacy conditions open as equivalent sentences", () => {
  assert.deepEqual(
    parseSimpleCondition("stages.check.complete && !stages.check.bad"),
    {
      match: "all",
      clauses: [
        { field: "stages.check.complete", operator: "eq", value: true },
        { field: "stages.check.bad", operator: "eq", value: false },
      ],
    },
  );
  assert.equal(
    compileRules(
      parseSimpleCondition(
        "(input.age >= 21) && (input.monthlyIncome > 4000)",
      )!,
    ),
    compileRules(group),
  );
});
test("complex expressions are retained in advanced view without guessing", () => {
  for (const expr of [
    "len(input.items) > 0",
    "input.a && input.b || input.c",
    'input.name == "a&&b"',
    "true",
  ])
    assert.equal(parseSimpleCondition(expr), null);
});
