"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Clause, Policy, RuleGroup } from "@/lib/types";
import type { Completion } from "@/lib/completions";
import { compileRules, fieldLabel, operators } from "@/lib/rules";

export function RuleSentence({
  group,
  policy,
  items,
  onChange,
  readOnly = false,
}: {
  group: RuleGroup;
  policy: Policy;
  items: Completion[];
  onChange?: (group: RuleGroup) => void;
  readOnly?: boolean;
}) {
  const [view, setView] = useState<"natural" | "form">("natural");
  function change(index: number, patch: Partial<Clause>) {
    onChange?.({
      ...group,
      clauses: group.clauses.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    });
  }
  function initialValue(type?: string) {
    return type === "boolean" ? true : type === "number" ? 0 : "";
  }
  return (
    <div className={`rule-sentence ${readOnly ? "readonly" : ""}`}>
      {!readOnly && (
        <div className="rule-view-toggle" aria-label="Rule view">
          <button
            type="button"
            aria-pressed={view === "natural"}
            onClick={() => setView("natural")}
          >
            Natural language
          </button>
          <button
            type="button"
            aria-pressed={view === "form"}
            onClick={() => setView("form")}
          >
            Form
          </button>
        </div>
      )}
      {readOnly || view === "natural" ? (
        <div className="sentence-content">
          {group.clauses.map((clause, index) => (
            <span className="sentence-clause" key={index}>
              {index > 0 && (
                <span className="sentence-connector">
                  {group.match === "all" ? "and" : "or"}
                </span>
              )}
              <span className="sentence-field">
                {fieldLabel(clause.field, policy)}
              </span>
              <span className="sentence-operator">
                {operators[clause.operator]}
              </span>
              {clause.operator !== "exists" && (
                <strong className="sentence-value">
                  {String(clause.value ?? "null")}
                </strong>
              )}
            </span>
          ))}
          <span className="sentence-period">.</span>
        </div>
      ) : (
        <div className="rule-form">
          <label className="rule-match">
            Match{" "}
            <select
              aria-label="Condition matching"
              value={group.match}
              onChange={(e) =>
                onChange?.({
                  ...group,
                  match: e.target.value as RuleGroup["match"],
                })
              }
            >
              <option value="all">All conditions</option>
              <option value="any">Any condition</option>
            </select>
          </label>
          {group.clauses.map((clause, index) => (
            <div className="rule-form-row" key={index}>
              <label>
                Field
                <select
                  aria-label={`Rule ${index + 1} field`}
                  value={clause.field}
                  onChange={(e) => {
                    const item = items.find((i) => i.path === e.target.value);
                    change(index, {
                      field: e.target.value,
                      operator: item?.type === "number" ? "gte" : "eq",
                      value: initialValue(item?.type),
                    });
                  }}
                >
                  {!items.some((item) => item.path === clause.field) && (
                    <option value={clause.field}>
                      {fieldLabel(clause.field, policy)}
                    </option>
                  )}
                  {items.map((item) => (
                    <option key={item.path} value={item.path}>
                      {fieldLabel(item.path, policy)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Operator
                <select
                  aria-label={`Rule ${index + 1} operator`}
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
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {clause.operator !== "exists" && (
                <label>
                  Value
                  {typeof clause.value === "boolean" ? (
                    <select
                      aria-label={`Rule ${index + 1} value`}
                      value={String(clause.value)}
                      onChange={(e) =>
                        change(index, { value: e.target.value === "true" })
                      }
                    >
                      <option>true</option>
                      <option>false</option>
                    </select>
                  ) : (
                    <input
                      aria-label={`Rule ${index + 1} value`}
                      type={
                        typeof clause.value === "number" ? "number" : "text"
                      }
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
                  )}
                </label>
              )}
              {group.clauses.length > 1 && (
                <button
                  type="button"
                  className="remove-clause"
                  aria-label={`Remove rule ${index + 1}`}
                  onClick={() =>
                    onChange?.({
                      ...group,
                      clauses: group.clauses.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          <div className="sentence-actions">
            <button
              type="button"
              disabled={group.clauses.length >= 16}
              onClick={() => {
                const item = items.find(
                  (i) => i.source === "payload" || i.source === "schema",
                );
                onChange?.({
                  ...group,
                  clauses: [
                    ...group.clauses,
                    {
                      field: item?.path || "input.value",
                      operator: item?.type === "number" ? "gte" : "eq",
                      value: initialValue(item?.type),
                    },
                  ],
                });
              }}
            >
              <Plus size={11} />
              Add condition
            </button>
            <details>
              <summary>Expression</summary>
              <pre>{compileRules(group)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
