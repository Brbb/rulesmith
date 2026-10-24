import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSHandle,
} from "quickjs-emscripten-core";

export const JS_LIMITS = {
  source: 16384,
  input: 131072,
  output: 65536,
  memory: 8 * 1024 * 1024,
  timeMs: 100,
  workerMs: 5000,
} as const;
const bytes = (value: string) => new TextEncoder().encode(value).length;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export function checkedJSON(value: unknown, limit: number): string {
  let entries = 0;
  function check(value: unknown, depth: number): void {
    if (depth > 40 || ++entries > 20000)
      throw new Error("JSON data is too deeply nested or too large");
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (!value || typeof value !== "object")
      throw new Error("Only plain JSON data can cross the sandbox boundary");
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) throw new Error(`Unsafe JSON key: ${key}`);
      check(child, depth + 1);
    }
  }
  check(value, 0);
  const json = JSON.stringify(value);
  if (bytes(json) > limit)
    throw new Error("JSON data exceeds the sandbox transfer limit");
  return json;
}
const bootstrap = `(() => {
  const stringify = JSON.stringify, parse = JSON.parse, getDescriptor = Object.getOwnPropertyDescriptor,
    keys = Reflect.ownKeys, getPrototype = Object.getPrototypeOf, objectPrototype = Object.prototype,
    arrayPrototype = Array.prototype, create = Object.create, isArray = Array.isArray, finite = Number.isFinite,
    number = Number, string = String, integer = Number.isInteger;
  Object.freeze(Object.prototype); Object.freeze(Array.prototype);
  globalThis.Date = undefined; globalThis.performance = undefined;
  Math.random = () => { throw new Error("Randomness is disabled in policy stages"); }; Object.freeze(Math);
  return {
    parse,
    encode(value) {
      if (!value || typeof value !== "object" || isArray(value) || ![objectPrototype, null].includes(getPrototype(value))) throw new Error("Return a plain JSON object; async functions and promises are not supported");
      let entries = 0; const seen = [];
      function copy(item, depth) {
        if (depth > 40 || ++entries > 20000) throw new Error("Output is too deeply nested or too large");
        if (item === null || typeof item === "string" || typeof item === "boolean") return item;
        if (typeof item === "number" && finite(item)) return item;
        if (!item || typeof item !== "object") throw new Error("Return JSON values only (no functions, undefined, BigInt or non-finite numbers)");
        if (seen.includes(item)) throw new Error("Cyclic output is not allowed");
        const array = isArray(item), prototype = getPrototype(item);
        if (prototype !== (array ? arrayPrototype : objectPrototype) && prototype !== null) throw new Error("Only plain JSON objects and arrays are allowed");
        const length = array ? getDescriptor(item, "length").value : 0;
        if (array && (!integer(length) || length < 0 || length > 10000 || keys(item).length !== length + 1)) throw new Error("Arrays must be dense and contain at most 10000 items");
        seen.push(item);
        const output = array ? [] : create(null);
        for (const key of keys(item)) {
          if (array && key === "length") continue;
          if (typeof key !== "string" || ["__proto__", "prototype", "constructor", "toJSON"].includes(key)) throw new Error("Unsafe output property");
          if (array && (!integer(number(key)) || number(key) < 0 || number(key) >= length || string(number(key)) !== key)) throw new Error("Only dense JSON array indices are allowed");
          const descriptor = getDescriptor(item, key);
          if (!descriptor || !("value" in descriptor)) throw new Error("Output getters and setters are not allowed");
          output[key] = copy(descriptor.value, depth + 1);
        }
        seen.pop(); return output;
      }
      return stringify(copy(value, 0));
    }
  };
})()`;

/** No host functions or application objects are installed into this VM. */
export async function executeSandbox(
  source: string,
  input: Record<string, unknown>,
  stages: Record<string, unknown>,
  validateOnly = false,
): Promise<Record<string, unknown>> {
  if (!source.trim() || bytes(source) > JS_LIMITS.source)
    throw new Error("JavaScript source must contain 1–16384 bytes");
  const payload = checkedJSON({ input, stages }, JS_LIMITS.input);
  const module = await newQuickJSWASMModuleFromVariant(variant);
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(JS_LIMITS.memory);
  runtime.setMaxStackSize(256 * 1024);
  const deadline = performance.now() + JS_LIMITS.timeMs;
  let ticks = 0;
  runtime.setInterruptHandler(
    () => performance.now() > deadline || ++ticks > 500,
  );
  const context = runtime.newContext(),
    handles: QuickJSHandle[] = [];
  function keep(handle: QuickJSHandle) {
    handles.push(handle);
    return handle;
  }
  try {
    const helpers = keep(
      context.unwrapResult(context.evalCode(bootstrap, "sandbox-bootstrap.js")),
    );
    if (validateOnly) {
      keep(
        context.unwrapResult(
          context.evalCode(
            `(function(input, stages) { "use strict";\n${source}\n})`,
            "policy-stage.js",
            { type: "global", compileOnly: true },
          ),
        ),
      );
      return {};
    }
    const fn = keep(
      context.unwrapResult(
        context.evalCode(
          `(function(input, stages) { "use strict";\n${source}\n})`,
          "policy-stage.js",
        ),
      ),
    );
    if (context.typeof(fn) !== "function")
      throw new Error(
        "Provide a JavaScript function body that returns a JSON object",
      );
    const parse = keep(context.getProp(helpers, "parse"));
    const encoded = keep(context.newString(payload));
    const data = keep(
      context.unwrapResult(
        context.callFunction(parse, context.undefined, encoded),
      ),
    );
    const guestInput = keep(context.getProp(data, "input")),
      guestStages = keep(context.getProp(data, "stages"));
    const result = keep(
      context.unwrapResult(
        context.callFunction(fn, context.undefined, guestInput, guestStages),
      ),
    );
    const encode = keep(context.getProp(helpers, "encode"));
    const output = keep(
      context.unwrapResult(
        context.callFunction(encode, context.undefined, result),
      ),
    );
    const json = context.getString(output);
    if (bytes(json) > JS_LIMITS.output)
      throw new Error("JavaScript output exceeds the 64 KiB limit");
    const parsed: unknown = JSON.parse(json);
    checkedJSON(parsed, JS_LIMITS.output);
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "JavaScript execution failed";
    throw new Error(message.slice(0, 600));
  } finally {
    for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
    context.dispose();
    runtime.dispose();
  }
}
