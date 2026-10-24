"use client";
import { useState } from "react";
import type { Policy, PolicyEdge, RuleGroup } from "@/lib/types";
import type { Completion } from "@/lib/completions";
import { edgeExpression, parseSimpleCondition } from "@/lib/rules";
import { ExpressionEditor } from "./expression-editor";
import { RuleSentence } from "./rule-sentence";

export function ConditionDefinition({
  edge,
  policy,
  items,
  onChange,
}: {
  edge: PolicyEdge;
  policy: Policy;
  items: Completion[];
  onChange: (patch: Partial<PolicyEdge>) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const parsed = edge.rules || parseSimpleCondition(edge.condition || "");
  const group = advanced ? null : parsed;
  if (edge.default)
    return (
      <div className="fallback-definition">
        <strong>Otherwise</strong>
        <p>Take this route only when no earlier switch case matches.</p>
      </div>
    );
  function setGroup(rules: RuleGroup) {
    setAdvanced(false);
    onChange({ rules, condition: undefined });
  }
  return (
    <div className="condition-editor-content">
      <div className="condition-mode-heading">
        <span>{group ? "Rule sentence" : "Advanced expression"}</span>
        {group ? (
          <button
            type="button"
            onClick={() => {
              setAdvanced(true);
              onChange({ condition: edgeExpression(edge), rules: undefined });
            }}
          >
            Use expression
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              setGroup(
                parsed || {
                  match: "all",
                  clauses: [
                    {
                      field: items[0]?.path || "input.value",
                      operator: "eq",
                      value:
                        items[0]?.type === "boolean"
                          ? true
                          : items[0]?.type === "number"
                            ? 0
                            : "",
                    },
                  ],
                },
              )
            }
          >
            {parsed ? "Use sentences" : "Replace with sentence"}
          </button>
        )}
      </div>
      {group ? (
        <RuleSentence
          group={group}
          policy={policy}
          items={items}
          onChange={setGroup}
        />
      ) : (
        <ExpressionEditor
          key={edge.id}
          label="Condition expression"
          value={edge.condition || ""}
          onChange={(condition) => onChange({ condition, rules: undefined })}
          items={items}
          placeholder="true"
        />
      )}
    </div>
  );
}
