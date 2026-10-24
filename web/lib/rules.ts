import type { Clause, Policy, PolicyEdge, RuleGroup } from "./types";
export const operators: Record<Clause["operator"], string> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
  exists: "is provided",
};
const codes: Record<Clause["operator"], string> = {
  eq: "==",
  neq: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  contains: "contains",
  exists: "!=",
};
export function compileRules(group: RuleGroup): string {
  return group.clauses
    .map(
      (c) =>
        `(${c.field} ${codes[c.operator]} ${c.operator === "exists" || c.value == null ? "nil" : JSON.stringify(c.value)})`,
    )
    .join(group.match === "any" ? " || " : " && ");
}
export function edgeExpression(edge: PolicyEdge): string {
  return edge.default
    ? "otherwise"
    : edge.rules
      ? compileRules(edge.rules)
      : edge.condition?.trim() || "true";
}
export function humanize(value: string): string {
  return value
    .replace(/^input\./, "")
    .replace(/^stages\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function fieldLabel(field: string, policy: Policy): string {
  const key = field.startsWith("input.") ? field.slice(6) : "";
  return policy.inputSchema[key]?.label || humanize(field);
}
export function ruleSentence(group: RuleGroup, policy: Policy): string {
  return group.clauses
    .map(
      (c) =>
        `${fieldLabel(c.field, policy)} ${operators[c.operator]}${c.operator === "exists" ? "" : " " + (typeof c.value === "string" ? `“${c.value}”` : String(c.value))}`,
    )
    .join(group.match === "any" ? " or " : " and ");
}
export function routeLabel(edge: PolicyEdge, policy: Policy): string {
  return (
    edge.label?.trim() ||
    (edge.default
      ? "Otherwise"
      : `Route to ${policy.stages.find((s) => s.id === edge.to)?.name || edge.to}`)
  );
}

/** Convert the simple boolean/comparison subset without guessing at arbitrary Expr code. */
export function parseSimpleCondition(code: string): RuleGroup | null {
  const hasAnd = code.includes("&&"),
    hasOr = code.includes("||");
  if (hasAnd && hasOr) return null;
  const parts = code.split(hasOr ? "||" : "&&");
  const clauses: Clause[] = [];
  const field =
    '(?:input|stages)(?:\\.[A-Za-z_$][\\w$]*|\\[(?:[0-9]+|"(?:[^"\\\\]|\\\\.)*")\\])+';
  for (let part of parts) {
    part = part.trim();
    if (part.startsWith("(") && part.endsWith(")"))
      part = part.slice(1, -1).trim();
    const bare = part.match(new RegExp("^(!?)(" + field + ")$"));
    if (bare) {
      clauses.push({ field: bare[2], operator: "eq", value: !bare[1] });
      continue;
    }
    const comparison = part.match(
      new RegExp("^(" + field + ")\\s*(==|!=|>=|<=|>|<)\\s*(.+)$"),
    );
    if (!comparison) return null;
    let value: Clause["value"];
    try {
      value = comparison[3] === "nil" ? null : JSON.parse(comparison[3]);
      if (value !== null && typeof value === "object") return null;
    } catch {
      return null;
    }
    const operator: Record<string, Clause["operator"]> = {
      "==": "eq",
      "!=": "neq",
      ">=": "gte",
      "<=": "lte",
      ">": "gt",
      "<": "lt",
    };
    clauses.push({
      field: comparison[1],
      operator: operator[comparison[2]],
      value,
    });
  }
  return clauses.length ? { match: hasOr ? "any" : "all", clauses } : null;
}
