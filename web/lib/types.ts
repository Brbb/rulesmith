export type Field = {
  type: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  label?: string;
};
export type Stage = {
  id: string;
  name: string;
  kind: "transform" | "switch" | "if" | "javascript" | "decision";
  inputs?: Record<string, Field>;
  outputs?: Record<string, Field>;
  expressions?: Record<string, string>;
  script?: string;
  cases?: RoutingCase[];
  routing?: "exclusive";
  outcome?: string;
  explanation: string;
};
export type Clause = {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
  value?: string | number | boolean | null;
};
export type RuleGroup = { match: "all" | "any"; clauses: Clause[] };
export type RoutingCase = {
  id: string;
  label?: string;
  condition?: string;
  rules?: RuleGroup;
  order?: number;
  default?: boolean;
};
export type PolicyEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
  rules?: RuleGroup;
  order?: number;
  default?: boolean;
};
export type Policy = {
  version: number;
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, Field>;
  stages: Stage[];
  edges: PolicyEdge[];
  exampleInput?: Record<string, unknown>;
};
export type Run = {
  runtime?: "browser-assisted";
  policyId: string;
  outcome: string;
  explanation: string;
  trace: {
    stageId: string;
    name: string;
    status: string;
    explanation: string;
    outputs?: Record<string, unknown>;
    edges?: {
      edgeId: string;
      condition: string;
      matched: boolean;
      label?: string;
    }[];
  }[];
};
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    "/api/" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
