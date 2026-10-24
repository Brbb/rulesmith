"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  payloadCompletions,
  stageCompletions,
  upstreamStages,
} from "@/lib/completions";
import { connectStages } from "@/lib/canvas-actions";
import { ConditionDefinition } from "./condition-definition";
import type { Policy, RoutingCase, Stage } from "@/lib/types";

export function SwitchCases({
  policy,
  stage,
  input,
  onChange,
}: {
  policy: Policy;
  stage: Stage;
  input: string;
  onChange: (policy: Policy) => void;
}) {
  const [error, setError] = useState("");
  const cases = [...(stage.cases || [])].sort(
    (a, b) =>
      Number(!!a.default) - Number(!!b.default) ||
      (a.order || 0) - (b.order || 0) ||
      a.id.localeCompare(b.id),
  );
  const items = [
    ...payloadCompletions(input, policy.inputSchema).items,
    ...stageCompletions(upstreamStages(policy, stage.id, false)),
  ];
  function patch(id: string, patch: Partial<RoutingCase>) {
    onChange({
      ...policy,
      stages: policy.stages.map((node) =>
        node.id === stage.id
          ? {
              ...node,
              cases: node.cases?.map((item) =>
                item.id === id ? { ...item, ...patch } : item,
              ),
            }
          : node,
      ),
    });
  }
  function add(fallback = false) {
    const id = `case_${crypto.randomUUID().slice(0, 8)}`;
    const field = items[0];
    const item: RoutingCase = {
      id,
      label: fallback ? "Otherwise" : "New case",
      order: cases.length + 1,
      ...(fallback
        ? { default: true }
        : {
            rules: {
              match: "all",
              clauses: [
                {
                  field: field?.path || "input.value",
                  operator: "eq",
                  value:
                    field?.type === "number"
                      ? 0
                      : field?.type === "boolean"
                        ? true
                        : "",
                },
              ],
            },
          }),
    };
    onChange({
      ...policy,
      stages: policy.stages.map((node) =>
        node.id === stage.id ? { ...node, cases: [...cases, item] } : node,
      ),
    });
  }
  function move(index: number, direction: number) {
    const list = cases.filter((item) => !item.default);
    const to = index + direction;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    const rank = new Map(list.map((item, i) => [item.id, i + 1]));
    onChange({
      ...policy,
      stages: policy.stages.map((node) =>
        node.id === stage.id
          ? {
              ...node,
              cases: cases.map((item) => ({
                ...item,
                order: rank.get(item.id) ?? item.order,
              })),
            }
          : node,
      ),
    });
  }
  function retarget(id: string, to: string) {
    if (to)
      try {
        onChange(connectStages(policy, stage.id, to, id, "replace"));
        setError("");
      } catch (error) {
        setError((error as Error).message);
      }
  }

  return (
    <div className="switch-cases block-case-editor">
      {error && (
        <p className="test-case-error" role="alert">
          {error}
        </p>
      )}
      <p className="sidebar-copy">
        {stage.kind === "if"
          ? "True follows this condition. False is the fallback."
          : stage.routing === "exclusive"
            ? "Migrated routing: exactly one case must match. Overlapping cases fail closed."
            : "Cases run in order. The first match wins; otherwise use the fallback."}
      </p>
      {stage.kind === "switch" && (
        <label>
          Routing mode
          <select
            aria-label="Switch routing mode"
            value={stage.routing || "first"}
            onChange={(event) =>
              onChange({
                ...policy,
                stages: policy.stages.map((node) =>
                  node.id === stage.id
                    ? {
                        ...node,
                        routing:
                          event.target.value === "exclusive"
                            ? "exclusive"
                            : undefined,
                      }
                    : node,
                ),
              })
            }
          >
            <option value="first">First matching case</option>
            <option value="exclusive">Exactly one matching case</option>
          </select>
        </label>
      )}
      {cases.map((item, index) => {
        const edge = policy.edges.find(
          (edge) => edge.id === item.id && edge.from === stage.id,
        );

        return (
          <section className="block-case" key={item.id}>
            <div className="block-case-heading">
              <span className="if-badge">
                {stage.kind === "if"
                  ? item.default
                    ? "FALSE"
                    : "TRUE"
                  : item.default
                    ? "ELSE"
                    : `CASE ${index + 1}`}
              </span>
              <input
                aria-label={`Case label ${item.id}`}
                value={item.label || ""}
                onChange={(event) =>
                  patch(item.id, { label: event.target.value })
                }
              />
              {stage.kind === "switch" && !item.default && (
                <>
                  <button
                    aria-label={`Move case ${item.id} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label={`Move case ${item.id} down`}
                    disabled={
                      index >= cases.filter((item) => !item.default).length - 1
                    }
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                </>
              )}
              {stage.kind === "switch" && (
                <button
                  aria-label={`Remove case ${item.id}`}
                  onClick={() =>
                    onChange({
                      ...policy,
                      stages: policy.stages.map((node) =>
                        node.id === stage.id
                          ? {
                              ...node,
                              cases: cases.filter(
                                (other) => other.id !== item.id,
                              ),
                            }
                          : node,
                      ),
                      edges: policy.edges.filter((edge) => edge.id !== item.id),
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            {!item.default && (
              <ConditionDefinition
                edge={{
                  from: stage.id,
                  to: edge?.to || "",
                  ...item,
                }}
                policy={policy}
                items={items}
                onChange={(change) => patch(item.id, change)}
              />
            )}
            <label>
              Then go to
              <select
                aria-label={`Case destination ${item.id}`}
                value={edge?.to || ""}
                onChange={(event) => retarget(item.id, event.target.value)}
              >
                <option value="">Not connected — drag its connector</option>
                {policy.stages
                  .filter((node) => node.id !== stage.id)
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
              </select>
            </label>
          </section>
        );
      })}
      {stage.kind === "switch" && (
        <div className="switch-add-actions">
          <Button variant="outline" size="sm" onClick={() => add()}>
            <Plus />
            Add case
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={cases.some((item) => item.default)}
            onClick={() => add(true)}
          >
            Add fallback
          </Button>
        </div>
      )}
    </div>
  );
}
