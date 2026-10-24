import type { Field, Policy, Stage } from "./types";

export type Completion = {
  path: string;
  type: string;
  preview: string;
  source: "payload" | "schema" | "stage";
};
export type CompletionContext = { start: number; end: number; prefix: string };
const identifier = /^[A-Za-z_$][\w$]*$/;
function member(base: string, key: string) {
  return identifier.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`;
}
function valueType(value: unknown) {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
}
function preview(value: unknown) {
  const text = JSON.stringify(value);
  return text === undefined
    ? "not provided"
    : text.length > 65
      ? text.slice(0, 62) + "…"
      : text;
}

/** Discover real payload paths. Arrays expose a representative [0] item, without inventing fields. */
export function payloadCompletions(
  text: string,
  schema: Record<string, Field> = {},
): { items: Completion[]; valid: boolean } {
  const items = new Map<string, Completion>();
  let valid = false;
  function walk(value: unknown, path: string, depth: number) {
    if (items.size >= 300 || depth > 6) return;
    items.set(path, {
      path,
      type: valueType(value),
      preview: preview(value),
      source: "payload",
    });
    if (Array.isArray(value)) {
      if (value.length) walk(value[0], `${path}[0]`, depth + 1);
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value))
        walk(child, member(path, key), depth + 1);
    }
  }
  try {
    const data: unknown = JSON.parse(text);
    if (data !== null && !Array.isArray(data) && typeof data === "object") {
      valid = true;
      for (const [key, value] of Object.entries(data))
        walk(value, member("input", key), 0);
    }
  } catch {
    /* Keep declared fields available while JSON is incomplete. */
  }
  for (const [key, field] of Object.entries(schema)) {
    const path = member("input", key);
    if (!items.has(path))
      items.set(path, {
        path,
        type: field.type,
        preview: "not in test payload",
        source: "schema",
      });
  }
  return {
    items: [...items.values()].sort((a, b) => a.path.localeCompare(b.path)),
    valid,
  };
}

/** Conditions can access their source; a stage's own expressions can only access its ancestors. */
export function upstreamStages(
  policy: Policy,
  id: string,
  includeSelf: boolean,
): Stage[] {
  const ids = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of policy.edges)
      if (edge.to === current && !ids.has(edge.from)) {
        ids.add(edge.from);
        queue.push(edge.from);
      }
  }
  ids.delete(id);
  if (includeSelf) ids.add(id);
  return policy.stages.filter((s) => ids.has(s.id));
}
export function stageCompletions(stages: Stage[]): Completion[] {
  return stages.flatMap((s) =>
    Object.entries(s.outputs || {}).map(([key, field]) => ({
      path: member(member("stages", s.id), key),
      type: field.type,
      preview: `${s.name} output`,
      source: "stage" as const,
    })),
  );
}

/** Replace the token around the caret, preserving the rest of the expression. */
export function completionContext(
  value: string,
  caret: number,
): CompletionContext {
  const before = value.slice(0, caret);
  const token = before.match(/[A-Za-z_$][\w$.\[\]"'-]*$/)?.[0] || "";
  let end = caret;
  if (token)
    while (end < value.length && /[\w$.\[\]"'-]/.test(value[end])) end++;
  return { start: caret - token.length, end, prefix: token };
}
export function matchingCompletions(
  items: Completion[],
  context: CompletionContext,
): Completion[] {
  return items
    .filter((item) => {
      const dotPath = item.path.replace(
        /\[("(?:[^"\\]|\\.)*")\]/g,
        (_match, quoted: string) => "." + JSON.parse(quoted),
      );
      return [item.path, dotPath].some((path) =>
        path.toLowerCase().startsWith(context.prefix.toLowerCase()),
      );
    })
    .slice(0, 12);
}
export function insertCompletion(
  value: string,
  context: CompletionContext,
  path: string,
) {
  return {
    value: value.slice(0, context.start) + path + value.slice(context.end),
    caret: context.start + path.length,
  };
}

export function shouldSuggest(
  value: string,
  caret: number,
  context: CompletionContext,
  forced = false,
) {
  return (
    forced || context.prefix.length > 0 || value.slice(0, caret).trim() === ""
  );
}
