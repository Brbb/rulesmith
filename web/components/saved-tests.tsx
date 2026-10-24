"use client";
import { resultOutcomes } from "@/lib/canvas-actions";
import { PayloadEditor } from "./payload-editor";
import { parsePayload } from "@/lib/payload-form";
import { evaluatePolicy } from "@/lib/evaluate";
import { useEffect, useState } from "react";
import { Check, Loader2, Play, Plus, X } from "lucide-react";
import { api, type Policy, type Run } from "@/lib/types";
import { recordRun, type RunRecord } from "@/lib/audit";
type TestCase = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  expected: string;
};
const outcomes: readonly string[] = resultOutcomes;
export function SavedTests({
  documentId,
  policy,
  input,
  onRecord,
  onLoad,
  inputValid,
}: {
  documentId: string;
  policy: Policy;
  input: string;
  inputValid: boolean;
  onRecord: (record: RunRecord) => void;
  onLoad: (input: string) => void;
}) {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [expected, setExpected] = useState("PASS");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, RunRecord>>({});
  const [error, setError] = useState("");
  const [invalidCases, setInvalidCases] = useState<Record<string, boolean>>({});
  const key = "policy-studio-tests-v1:" + documentId;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(saved))
        setCases(
          saved
            .filter(
              (test) =>
                test.id &&
                typeof test.name === "string" &&
                test.input &&
                typeof test.input === "object" &&
                !Array.isArray(test.input) &&
                outcomes.includes(test.expected),
            )
            .slice(0, 20),
        );
    } catch {
      /* Ignore malformed saved test cases. */
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(key, JSON.stringify(cases));
      } catch {
        setError("Test cases could not be stored in this browser.");
      }
  }, [cases, ready, key]);
  function saveCase() {
    try {
      const payload = JSON.parse(input);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("The test payload must be a JSON object.");
      setCases((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          name: name.trim() || `Case ${previous.length + 1}`,
          input: payload,
          expected,
        },
      ]);
      setAdding(false);
      setName("");
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function runTests(targets: TestCase[]) {
    setBusy(true);
    setError("");
    try {
      for (const test of targets) {
        const result = await evaluatePolicy(policy, test.input);
        const record = recordRun(policy, test.input, result);
        setResults((previous) => ({ ...previous, [test.id]: record }));
        onRecord(record);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="saved-tests" aria-label="Saved test cases">
      <div className="tool-section-heading">
        <span>
          TEST CASES <small>{cases.length}</small>
        </span>
        <button
          disabled={
            !ready ||
            busy ||
            !cases.length ||
            cases.some((test) => invalidCases[test.id])
          }
          onClick={() => runTests(cases)}
        >
          {busy ? <Loader2 className="spin" size={11} /> : <Play size={11} />}
          Run all
        </button>
      </div>
      {cases.map((test) => {
        const result = results[test.id];
        const current =
          result &&
          !invalidCases[test.id] &&
          JSON.stringify(result.policy) === JSON.stringify(policy) &&
          JSON.stringify(result.input) === JSON.stringify(test.input);
        const passed = current && result.result.outcome === test.expected;
        return (
          <details className="saved-test" key={test.id}>
            <summary>
              <span
                className={
                  current
                    ? passed
                      ? "state-pass"
                      : "state-execution_error"
                    : ""
                }
              >
                {current ? (
                  passed ? (
                    <Check size={12} />
                  ) : (
                    <X size={12} />
                  )
                ) : (
                  <Play size={11} />
                )}
              </span>
              <strong>{test.name}</strong>
              <small>
                {current
                  ? passed
                    ? "Passed"
                    : "Failed"
                  : result
                    ? "Run again"
                    : test.expected}
              </small>
            </summary>
            <div className="saved-test-body">
              <span>
                Expected {test.expected}
                {result ? ` · Actual ${result.result.outcome}` : ""}
              </span>
              <CasePayloadEditor
                input={test.input}
                name={test.name}
                onChange={(input) =>
                  setCases((previous) =>
                    previous.map((item) =>
                      item.id === test.id ? { ...item, input } : item,
                    ),
                  )
                }
                onValidityChange={(valid) =>
                  setInvalidCases((previous) =>
                    previous[test.id] === !valid
                      ? previous
                      : { ...previous, [test.id]: !valid },
                  )
                }
              />

              {result && <p>{result.result.explanation}</p>}
              <div>
                <button
                  disabled={busy || !!invalidCases[test.id]}
                  onClick={() => runTests([test])}
                >
                  Run case
                </button>
                <button
                  disabled={!!invalidCases[test.id]}
                  onClick={() => onLoad(JSON.stringify(test.input, null, 2))}
                >
                  Use payload
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    setCases((previous) =>
                      previous.filter((item) => item.id !== test.id),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          </details>
        );
      })}
      {!cases.length && (
        <p>
          No saved cases. Save this payload with an expected outcome to check
          future edits.
        </p>
      )}
      {!adding ? (
        <button
          className="save-test-case"
          disabled={!ready || busy || cases.length >= 20 || !inputValid}
          onClick={() => setAdding(true)}
        >
          <Plus size={11} />
          Save payload as case
        </button>
      ) : (
        <form
          className="test-case-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveCase();
          }}
        >
          <input
            aria-label="Test case name"
            placeholder="Case name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Expected test outcome"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          >
            {outcomes.map((outcome) => (
              <option key={outcome}>{outcome}</option>
            ))}
          </select>
          <button type="submit" disabled={!inputValid}>
            Save case
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="test-case-error">
          {error}
        </p>
      )}
    </section>
  );
}

function CasePayloadEditor({
  input,
  name,
  onChange,
  onValidityChange,
}: {
  input: Record<string, unknown>;
  name: string;
  onChange: (input: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(input, null, 2));
  return (
    <PayloadEditor
      label={`Case ${name}`}
      value={text}
      onValidityChange={onValidityChange}
      onChange={(next) => {
        setText(next);
        const parsed = parsePayload(next);
        if (parsed.value) onChange(parsed.value);
      }}
    />
  );
}
