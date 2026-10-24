import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPayloadField,
  emptyValue,
  jsonType,
  parseFormNumber,
  parsePayload,
  removePayloadValue,
  renamePayloadField,
  setPayloadValue,
  valueAt,
  type JsonObject,
} from "./payload-form";
test("nested edits preserve sibling data and types without mutating the original input", () => {
  const root = {
    customer: { active: true, address: { zip: "00123" } },
    orders: [{ amount: 12.5, notes: null }],
    count: 0,
  };
  const snapshot = JSON.stringify(root);
  const next = setPayloadValue(root, ["orders", 0, "amount"], -2.25);
  assert.equal(valueAt(next, ["orders", 0, "amount"]), -2.25);
  assert.deepEqual(valueAt(next, ["customer"]), root.customer);
  assert.equal(valueAt(next, ["orders", 0, "notes"]), null);
  assert.equal(JSON.stringify(root), snapshot);
  assert.deepEqual(parsePayload(JSON.stringify(next)).value, next);
});
test("fields and array items can be added, renamed and removed at any depth", () => {
  let root: JsonObject = {
    customer: { name: "Ada" },
    items: [{ sku: "A" }, { sku: "B" }],
  };
  root = addPayloadField(root, ["customer"]) as JsonObject;
  root = addPayloadField(root, ["customer"]) as JsonObject;
  assert.equal(valueAt(root, ["customer", "field1"]), "");
  root = renamePayloadField(root, ["customer", "field"], "email") as JsonObject;
  root = setPayloadValue(
    root,
    ["customer", "email"],
    "ada@example.test",
  ) as JsonObject;
  root = removePayloadValue(root, ["customer", "field1"]) as JsonObject;
  root = addPayloadField(root, ["items"]) as JsonObject;
  assert.deepEqual(valueAt(root, ["items"]), [{ sku: "A" }, { sku: "B" }, ""]);
  root = removePayloadValue(root, ["items", 0]) as JsonObject;
  assert.deepEqual(valueAt(root, ["items"]), [{ sku: "B" }, ""]);
  assert.equal(valueAt(root, ["customer", "email"]), "ada@example.test");
  assert.throws(
    () => renamePayloadField(root, ["customer", "email"], "name"),
    /already exists/,
  );
});
test("unusual and prototype-shaped keys stay literal and cannot pollute objects", () => {
  const root = JSON.parse(
    '{"__proto__":{"flag":false},"constructor":"own","customer.name":"literal","":{"value":1}}',
  );
  const updated = setPayloadValue(root, ["__proto__", "flag"], true);
  assert.equal(valueAt(updated, ["__proto__", "flag"]), true);
  assert.equal(({} as { flag?: boolean }).flag, undefined);
  assert.equal(Object.getPrototypeOf(updated), Object.prototype);
  const renamed = renamePayloadField(updated, ["customer.name"], "prototype");
  assert.equal(valueAt(renamed, ["prototype"]), "literal");
  assert.equal(valueAt(renamed, ["", "value"]), 1);
  assert.equal(valueAt(renamed, ["constructor"]), "own");
  assert.deepEqual(parsePayload(JSON.stringify(renamed)).value, renamed);
});
test("JSON view rejects incomplete syntax, scalar roots, and overflowing numbers without replacing text", () => {
  for (const text of [
    '{"open":',
    "null",
    "[]",
    '"hello"',
    "12",
    '{"amount":1e999}',
  ])
    assert.ok(parsePayload(text).error, text);
  assert.deepEqual(parsePayload("{}").value, {});
  assert.deepEqual(
    parsePayload('{"items":[],"missing":null,"enabled":false}').value,
    { items: [], missing: null, enabled: false },
  );
});
test("numeric form drafts distinguish incomplete numbers from valid zero, decimals and exponents", () => {
  for (const text of [
    "",
    "-",
    "1.",
    "1e",
    "NaN",
    "Infinity",
    "1e999",
    "01",
    " ",
  ])
    assert.equal(parseFormNumber(text), undefined, text);
  for (const [text, value] of [
    ["0", 0],
    ["-2.5", -2.5],
    ["1e3", 1000],
    ["-0.25", -0.25],
  ] as const)
    assert.equal(parseFormNumber(text), value);
});
test("type defaults cover all JSON value types without sharing mutable containers", () => {
  for (const type of [
    "string",
    "number",
    "boolean",
    "object",
    "array",
    "null",
  ] as const)
    assert.equal(jsonType(emptyValue(type)), type);
  assert.notEqual(emptyValue("object"), emptyValue("object"));
  assert.notEqual(emptyValue("array"), emptyValue("array"));
});
