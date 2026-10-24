import type { Policy, Run } from "./types";

export type RunRecord = {
  id: string;
  at: string;
  policy: Policy;
  input: Record<string, unknown>;
  result: Run;
  replayOf?: string;
  documentId?: string;
};
export const runStorageKey = "policy-studio-runs-v1";
export function recordRun(
  policy: Policy,
  input: Record<string, unknown>,
  result: Run,
  replayOf?: string,
): RunRecord {
  // Snapshots must survive subsequent edits to the policy and test payload.
  return JSON.parse(
    JSON.stringify({
      id: crypto.randomUUID().slice(0, 8),
      at: new Date().toISOString(),
      policy,
      input,
      result,
      replayOf,
    }),
  );
}
export function findRun(
  records: RunRecord[],
  target = "last",
): RunRecord | undefined {
  if (["last", "latest", ""].includes(target.toLowerCase())) return records[0];
  const matches = records.filter((r) =>
    r.id.toLowerCase().startsWith(target.replace(/^#/, "").toLowerCase()),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export type AuditIntent = {
  kind: "run" | "runs" | "audit" | "replay";
  target: string;
};
export function auditIntent(text: string): AuditIntent | undefined {
  const value = text.trim();
  const command = value.match(
    /^\/(run|runs|audit|explain|replay)(?:\s+([\s\S]*))?$/i,
  );
  if (command)
    return {
      kind:
        command[1].toLowerCase() === "explain"
          ? "audit"
          : (command[1].toLowerCase() as AuditIntent["kind"]),
      target: (command[2] || "").trim(),
    };
  if (
    /^(run|test|evaluate)( (this|the|current))?( policy| draft| workflow)?[.!]?$/i.test(
      value,
    )
  )
    return { kind: "run", target: "" };
  const replay = value.match(
    /^replay(?: (?:run|decision))?(?: #?([\w-]+))?[.!]?$/i,
  );
  if (replay) return { kind: "replay", target: replay[1] || "last" };
  if (/^(show|list)( (my|the|recent|all|saved))? runs[.!]?$/i.test(value))
    return { kind: "runs", target: "" };
  const filtered = value.match(
    /^(?:show|list)(?: (?:the|recent|saved))? (pass|flag|flagged|unknown|execution_error|failed) runs[.!]?$/i,
  );
  if (filtered)
    return {
      kind: "runs",
      target: (
        { flagged: "FLAG", failed: "EXECUTION_ERROR" }[
          filtered[1].toLowerCase()
        ] || filtered[1]
      ).toUpperCase(),
    };
  if (
    /^why (?:did|was) (?:the )?(?:last|latest|this) (?:run|decision)(?: .+)?[?!.]?$/i.test(
      value,
    )
  )
    return { kind: "audit", target: "last" };
  const explain = value.match(
    /^(?:explain|audit)(?: (?:this|the|last|latest))?(?: run| decision)(?: #?([\w-]+))?[.!]?$/i,
  );
  if (explain) return { kind: "audit", target: explain[1] || "last" };
}
export function filterRuns(records: RunRecord[], query: string): RunRecord[] {
  const term = query.trim().toLowerCase();
  return records.filter(
    (r) =>
      !term ||
      [r.id, r.result.outcome, r.policy.name, r.policy.id].some((v) =>
        v.toLowerCase().includes(term),
      ),
  );
}
