"use client";
import { useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { OutcomeIcon } from "@/components/outcome-icon";
import { payloadCompletions } from "@/lib/completions";
import { parseSimpleCondition } from "@/lib/rules";
import type { RunRecord } from "@/lib/audit";

export function RunCard({
  record,
  onReplay,
  disabled = false,
}: {
  record: RunRecord;
  onReplay: (id: string) => void;
  disabled?: boolean;
}) {
  const [view, setView] = useState<"details" | "code" | null>(null);
  const { result } = record;
  const evaluated = new Set(
    result.trace.flatMap(
      (step) => step.edges?.map((edge) => edge.edgeId) || [],
    ),
  );
  const fields = new Set(
    record.policy.edges
      .filter((edge) => evaluated.has(edge.id))
      .flatMap(
        (edge) =>
          (
            edge.rules || parseSimpleCondition(edge.condition || "")
          )?.clauses.map((clause) => clause.field) || [],
      ),
  );
  const evidence = payloadCompletions(
    JSON.stringify(record.input),
    record.policy.inputSchema,
  )
    .items.filter((item) => fields.has(item.path))
    .slice(0, 3);
  const routes = result.trace.flatMap((t) =>
    (t.edges || []).filter((e) => e.matched).map((e) => e.label || e.edgeId),
  );
  return (
    <article className="execution-card">
      <div className="action-heading">
        <span className={`action-icon state-${result.outcome.toLowerCase()}`}>
          <OutcomeIcon outcome={result.outcome} size={17} />
        </span>
        <div>
          <strong>
            {record.replayOf ? "Replayed" : "Evaluated"} {record.policy.name}
          </strong>
          <small>
            {result.runtime === "browser-assisted" && "Browser sandbox · "}#
            {record.id} · {new Date(record.at).toLocaleString()}
          </small>
        </div>
      </div>
      {evidence.length > 0 && (
        <div className="execution-evidence">
          {evidence.map((item) => (
            <code key={item.path}>
              {item.path.replace(/^input\./, "")} = {item.preview}
            </code>
          ))}
        </div>
      )}
      <div className="execution-path">
        {routes.map((route, i) => (
          <span key={i}>
            <code>{route}</code>
            <ChevronRight size={11} />
          </span>
        ))}
        <b className={`state-${result.outcome.toLowerCase()}`}>
          {result.outcome}
        </b>
      </div>
      <p>{result.explanation}</p>
      <div className="action-tabs">
        <button
          aria-pressed={view === "details"}
          onClick={() => setView(view === "details" ? null : "details")}
        >
          Details
        </button>
        <button
          aria-pressed={view === "code"}
          onClick={() => setView(view === "code" ? null : "code")}
        >
          Code
        </button>
        <button
          title="Execute the saved policy and input again"
          disabled={disabled}
          onClick={() => onReplay(record.id)}
        >
          <RotateCcw size={11} /> Replay
        </button>
      </div>
      {view === "code" && (
        <pre className="action-code">{JSON.stringify(record, null, 2)}</pre>
      )}
      {view === "details" && (
        <div className="audit-details">
          <small>
            Policy v{record.policy.version} · {result.trace.length} stages
            {record.replayOf ? ` · Replay of #${record.replayOf}` : ""}
          </small>
          <details>
            <summary>Saved input</summary>
            <pre>{JSON.stringify(record.input, null, 2)}</pre>
          </details>
          {result.trace.map((step, index) => (
            <details key={index}>
              <summary>
                <span className={`state-${step.status.toLowerCase()}`}>●</span>{" "}
                {step.name} <small>{step.status}</small>
              </summary>
              <p>{step.explanation}</p>
              {step.outputs && (
                <pre>{JSON.stringify(step.outputs, null, 2)}</pre>
              )}
              {step.edges?.map((edge) => (
                <div className="audit-branch" key={edge.edgeId}>
                  <strong>
                    {edge.label || edge.edgeId} ·{" "}
                    {edge.matched ? "Matched" : "Not matched"}
                  </strong>
                  <code>{edge.condition}</code>
                </div>
              ))}
            </details>
          ))}
          <details>
            <summary>Saved policy definition</summary>
            <pre>{JSON.stringify(record.policy, null, 2)}</pre>
          </details>
        </div>
      )}
    </article>
  );
}
