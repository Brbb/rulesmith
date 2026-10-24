import { test } from "node:test";
import assert from "node:assert/strict";
import { executeSandbox, checkedJSON, JS_LIMITS } from "./sandbox-core.js";
test("JavaScript can aggregate and transform JSON without mutating caller inputs", async () => {
  const input = {
    items: [
      { price: 12, qty: 2 },
      { price: 5, qty: 3 },
    ],
  };
  const result = await executeSandbox(
    "const total = input.items.reduce((sum, item) => sum + item.price * item.qty, 0); input.items[0].price = 999; return { total, taxed: total * stages.tax.rate };",
    input,
    { tax: { rate: 1.2 } },
  );
  assert.deepEqual(result, { total: 39, taxed: 46.8 });
  assert.equal(input.items[0].price, 12);
});
test("guest has no page, worker, network, storage, process or host bindings", async () => {
  const result = await executeSandbox(
    "return { capabilities: [typeof window, typeof document, typeof self, typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof Worker, typeof navigator, typeof localStorage, typeof indexedDB, typeof process, typeof require, typeof postMessage, typeof WebAssembly] };",
    {},
    {},
  );
  assert.deepEqual(result.capabilities, Array(14).fill("undefined"));
  assert.deepEqual(
    await executeSandbox(
      `return { escape: ({}).constructor.constructor('return typeof fetch + ":" + typeof process')() };`,
      {},
      {},
    ),
    { escape: "undefined:undefined" },
  );
  await assert.rejects(
    executeSandbox('fetch("https://example.invalid"); return {};', {}, {}),
  );
});
test("guest-created script and HTML strings remain inert data", async () => {
  const text =
    '<img src=x onerror="globalThis.pwned=true"><script>alert(1)</script>';
  assert.deepEqual(
    await executeSandbox("return { html: input.text };", { text }, {}),
    { html: text },
  );
  assert.equal((globalThis as Record<string, unknown>).pwned, undefined);
});
test("prototype writes and dangerous serialized keys are rejected", async () => {
  await assert.rejects(
    executeSandbox("Object.prototype.polluted = true; return {};", {}, {}),
  );
  await assert.rejects(
    executeSandbox(
      'return JSON.parse(\'{"__proto__":{"polluted":true}}\');',
      {},
      {},
    ),
    /Unsafe/,
  );
  await assert.rejects(
    executeSandbox('return { nested: { constructor: "bad" } };', {}, {}),
    /Unsafe/,
  );
  assert.throws(
    () => checkedJSON(JSON.parse('{"prototype":true}'), JS_LIMITS.input),
    /Unsafe/,
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
test("infinite loops, recursion, large allocations and excessive output fail closed", async () => {
  await assert.rejects(executeSandbox("while (true) {}", {}, {}), /interrupt/i);
  await assert.rejects(
    executeSandbox(
      "function recurse() { return recurse(); } return { value: recurse() };",
      {},
      {},
    ),
  );
  await assert.rejects(
    executeSandbox('return { value: "x".repeat(20_000_000) };', {}, {}),
  );
  await assert.rejects(
    executeSandbox('return { value: "x".repeat(70_000) };', {}, {}),
    /64 KiB/,
  );
});
test("unsupported output values, promises, cycles, accessors and sparse arrays cannot cross the boundary", async () => {
  for (const source of [
    "return null;",
    "return [1];",
    "return { value: undefined };",
    "return { value: Infinity };",
    "return { value: 1n };",
    "return { value: () => 1 };",
    "return Promise.resolve({ value: 1 });",
    "const value = {}; value.self = value; return value;",
    "return { get value() { return 1; } };",
    "return { value: new Array(100000000) };",
    "return { value: Object.assign(new Array(1), { extra: true }) };",
  ])
    await assert.rejects(executeSandbox(source, {}, {}), source);
});
test("serialization uses captured intrinsics, and every stage receives a fresh VM", async () => {
  assert.deepEqual(
    await executeSandbox(
      'JSON.stringify = () => "not JSON"; globalThis.secret = 1; return { value: 2 };',
      {},
      {},
    ),
    { value: 2 },
  );
  assert.deepEqual(
    await executeSandbox("return { secret: typeof secret };", {}, {}),
    { secret: "undefined" },
  );
  await assert.rejects(
    executeSandbox("return { random: Math.random() };", {}, {}),
    /Randomness/,
  );
  assert.deepEqual(
    await executeSandbox("return { clock: typeof Date };", {}, {}),
    { clock: "undefined" },
  );
});
test("validation parses function bodies without running them; malformed and oversized code fail", async () => {
  assert.deepEqual(await executeSandbox("while (true) {}", {}, {}, true), {});
  await assert.rejects(executeSandbox("return { invalid: ; };", {}, {}, true));
  await assert.rejects(
    executeSandbox(" ".repeat(17000) + "return {};", {}, {}, true),
    /16384/,
  );
});
