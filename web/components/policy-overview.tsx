"use client";
import { ArrowUpRight, Check, FileText, GitBranch } from "lucide-react";
import type { Clause, Policy, PolicyEdge, RuleGroup, Run } from "@/lib/types";
import {
  fieldLabel,
  humanize,
  operators,
  parseSimpleCondition,
} from "@/lib/rules";
import {
  payloadCompletions,
  stageCompletions,
  upstreamStages,
} from "@/lib/completions";
import { orderedStages, stageRoutes } from "@/lib/policy-outline";

export function PolicyOverview({
  policy,
  input,
  run,
  fresh,
  onChange,
  onStage,
  onEdge,
}: {
  policy: Policy;
  input: string;
  run: Run | null;
  fresh: boolean;
  onChange: (policy: Policy) => void;
  onStage: (id: string) => void;
  onEdge: (id: string) => void;
}) {
  const ordered = orderedStages(policy);
  const stages = ordered.filter((stage) => stage.kind !== "decision");
  const decisions = ordered.filter((stage) => stage.kind === "decision");
  function updateEdge(id: string, patch: Partial<PolicyEdge>) {
    onChange({
      ...policy,
      edges: policy.edges.map((edge) =>
        edge.id === id ? { ...edge, ...patch } : edge,
      ),
    });
  }
  function sentence(edge: PolicyEdge, group: RuleGroup) {
    const fields = [
      ...payloadCompletions(input, policy.inputSchema).items,
      ...stageCompletions(upstreamStages(policy, edge.from, true)),
    ];
    function change(index: number, patch: Partial<Clause>) {
      updateEdge(edge.id, {
        condition: undefined,
        rules: {
          ...group,
          clauses: group.clauses.map((clause, i) =>
            i === index ? { ...clause, ...patch } : clause,
          ),
        },
      });
    }
    return group.clauses.map((clause, index) => (
      <span className="policy-prose-clause" key={index}>
        {index > 0 && (
          <select
            className="prose-join"
            aria-label={`${edge.id} condition join ${index + 1}`}
            value={group.match}
            onChange={(e) =>
              updateEdge(edge.id, {
                condition: undefined,
                rules: {
                  ...group,
                  match: e.target.value as RuleGroup["match"],
                },
              })
            }
          >
            <option value="all">and</option>
            <option value="any">or</option>
          </select>
        )}
        <select
          className="prose-field"
          aria-label={`${edge.id} condition ${index + 1} field`}
          value={clause.field}
          onChange={(e) => {
            const type = fields.find(
              (field) => field.path === e.target.value,
            )?.type;
            change(index, {
              field: e.target.value,
              operator: type === "number" ? "gte" : "eq",
              value: type === "number" ? 0 : type === "boolean" ? true : "",
            });
          }}
        >
          {!fields.some((field) => field.path === clause.field) && (
            <option value={clause.field}>
              {fieldLabel(clause.field, policy)}
            </option>
          )}
          {fields.map((field) => (
            <option value={field.path} key={field.path}>
              {fieldLabel(field.path, policy)}
            </option>
          ))}
        </select>
        <select
          className="prose-operator"
          aria-label={`${edge.id} condition ${index + 1} operator`}
          value={clause.operator}
          onChange={(e) => {
            const operator = e.target.value as Clause["operator"];
            change(index, {
              operator,
              ...(["gt", "gte", "lt", "lte"].includes(operator) &&
              typeof clause.value !== "number"
                ? { value: 0 }
                : operator === "contains"
                  ? { value: String(clause.value ?? "") }
                  : {}),
            });
          }}
        >
          {Object.entries(operators).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {clause.operator !== "exists" &&
          (typeof clause.value === "boolean" ? (
            <select
              className="prose-value"
              aria-label={`${edge.id} condition ${index + 1} value`}
              value={String(clause.value)}
              onChange={(e) =>
                change(index, { value: e.target.value === "true" })
              }
            >
              <option>true</option>
              <option>false</option>
            </select>
          ) : clause.value === null ? (
            <button className="prose-value" onClick={() => onEdge(edge.id)}>
              null
            </button>
          ) : (
            <input
              className="prose-value"
              aria-label={`${edge.id} condition ${index + 1} value`}
              type={typeof clause.value === "number" ? "number" : "text"}
              style={{
                width: `${Math.max(3, Math.min(22, String(clause.value ?? "").length + 1))}ch`,
              }}
              value={clause.value ?? ""}
              onChange={(e) =>
                change(index, {
                  value:
                    typeof clause.value === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          ))}
      </span>
    ));
  }
  function destination(edge: PolicyEdge) {
    const target = policy.stages.find((stage) => stage.id === edge.to);
    return (
      <select
        className={`prose-destination state-${target?.outcome?.toLowerCase() || "idle"}`}
        aria-label={`${edge.id} destination`}
        value={edge.to}
        onChange={(e) => updateEdge(edge.id, { to: e.target.value })}
      >
        {policy.stages
          .filter((stage) => stage.id !== edge.from)
          .map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
      </select>
    );
  }
  return (
    <section className="policy-overview" aria-label="Whole policy editor">
      <header className="policy-overview-header">
        <span>
          <FileText size={14} /> POLICY IN WORDS
        </span>
        <h2>{policy.name}</h2>
        <p>{policy.description}</p>
        <small>
          Edit the underlined fields to change the policy. Every view uses the
          same executable rules.
        </small>
      </header>
      <details className="policy-input-summary">
        <summary>
          {Object.keys(policy.inputSchema).length} input fields{" "}
          <span>· required inputs are checked before the workflow runs</span>
        </summary>
        <div>
          {Object.entries(policy.inputSchema).map(([key, field]) => (
            <span key={key} title={field.type}>
              {field.label || humanize(key)}{" "}
              <small>
                {field.type}
                {field.required ? " · required" : " · optional"}
              </small>
            </span>
          ))}
        </div>
      </details>
      <div className="policy-prose-sections">
        {stages.map((stage, index) => {
          const edges = stageRoutes(policy, stage);
          const trace = fresh
            ? run?.trace.find((step) => step.stageId === stage.id)
            : undefined;
          return (
            <article className="policy-prose-section" key={stage.id}>
              <div className="policy-section-heading">
                <span
                  className={`state-${trace?.status.toLowerCase() || "idle"}`}
                >
                  {trace ? <Check size={13} /> : <GitBranch size={13} />}
                </span>
                <h3>
                  {stages.length > 1 ? `${index + 1}. ` : ""}
                  {stage.name}
                </h3>
                <button
                  title={`Inspect ${stage.name}`}
                  aria-label={`Inspect stage ${stage.name}`}
                  onClick={() => onStage(stage.id)}
                >
                  <ArrowUpRight size={13} />
                </button>
              </div>
              <span className="policy-routing-note">
                {stage.kind === "switch"
                  ? "Cases are checked in order; the first match wins."
                  : stage.kind === "if"
                    ? "Check the condition, then follow True or False."
                    : "Continue to the next block."}
              </span>
              {stage.kind === "javascript" && (
                <details className="policy-computations">
                  <summary>
                    Transform data with isolated JavaScript code
                  </summary>
                  <pre>{stage.script}</pre>
                  <button onClick={() => onStage(stage.id)}>Edit code</button>
                </details>
              )}
              {!!Object.keys(stage.expressions || {}).length && (
                <details className="policy-computations">
                  <summary>
                    First calculate{" "}
                    {Object.keys(stage.expressions || {})
                      .map(humanize)
                      .join(", ")}
                  </summary>
                  {Object.entries(stage.expressions || {}).map(
                    ([key, expression]) => (
                      <div key={key}>
                        <strong>{humanize(key)}</strong>
                        <code>{expression}</code>
                      </div>
                    ),
                  )}
                </details>
              )}
              <div className="policy-prose">
                {edges.map((edge, i) => {
                  const group =
                    edge.rules || parseSimpleCondition(edge.condition || "");
                  const matched = trace?.edges?.find(
                    (item) => item.edgeId === edge.id,
                  )?.matched;
                  return (
                    <div
                      className={`policy-prose-route ${matched ? "route-matched" : ""}`}
                      key={edge.id}
                    >
                      <span className="prose-keyword">
                        {edge.default
                          ? "otherwise"
                          : group
                            ? stage.kind === "switch" && i > 0
                              ? "else if"
                              : "if"
                            : edge.condition?.trim() &&
                                edge.condition.trim() !== "true"
                              ? "if"
                              : "always"}
                      </span>{" "}
                      {!edge.default &&
                        (group ? (
                          sentence(edge, group)
                        ) : edge.condition?.trim() &&
                          edge.condition.trim() !== "true" ? (
                          <button
                            className="prose-expression"
                            onClick={() => onEdge(edge.id)}
                            title="Inspect advanced expression"
                          >
                            {edge.condition}
                          </button>
                        ) : null)}
                      <span className="prose-keyword">
                        {edge.default ? " " : " then "}
                      </span>
                      {destination(edge)}
                      <button
                        className="prose-inspect"
                        onClick={() => onEdge(edge.id)}
                        aria-label={`Inspect route ${edge.label || edge.id}`}
                      >
                        <ArrowUpRight size={12} />
                      </button>
                      {matched && (
                        <span
                          className="prose-matched"
                          title="Matched in the latest run"
                        >
                          <Check size={11} />
                        </span>
                      )}
                    </div>
                  );
                })}
                {!edges.length && (
                  <p className="policy-empty-routes">
                    No routes yet.{" "}
                    <button onClick={() => onStage(stage.id)}>
                      Configure this stage
                    </button>
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <section className="policy-decisions">
        <h3>Decisions</h3>
        {decisions.map((stage) => (
          <div className="policy-decision-row" key={stage.id}>
            <div>
              <button onClick={() => onStage(stage.id)}>
                {stage.name}
                <ArrowUpRight size={11} />
              </button>
              <p>{stage.explanation}</p>
            </div>
            <select
              className={`state-${stage.outcome?.toLowerCase()}`}
              aria-label={`${stage.name} outcome`}
              value={stage.outcome}
              onChange={(e) =>
                onChange({
                  ...policy,
                  stages: policy.stages.map((item) =>
                    item.id === stage.id
                      ? { ...item, outcome: e.target.value }
                      : item,
                  ),
                })
              }
            >
              <option>PASS</option>
              <option>REJECT</option>
              <option>FLAG</option>
              <option>UNKNOWN</option>
            </select>
          </div>
        ))}
      </section>
      <footer className="policy-outcome-note">
        Missing required input produces UNKNOWN. Invalid input types or
        execution failures produce EXECUTION_ERROR.
      </footer>
    </section>
  );
}
