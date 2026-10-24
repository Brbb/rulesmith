"use client";
import { useEffect, useState } from "react";
import { Code2, Loader2, Play, Plus, X } from "lucide-react";
import type { Completion } from "@/lib/completions";
import type { Field, Stage } from "@/lib/types";
import { runJavaScript } from "@/lib/javascript";
import { ExpressionEditor } from "./expression-editor";
export function JavaScriptEditor({
  stage,
  input,
  stages,
  items,
  onChange,
}: {
  stage: Stage;
  input: string;
  stages: Record<string, unknown>;
  items: Completion[];
  onChange: (patch: Partial<Stage>) => void;
}) {
  const [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState("");
  const [name, setName] = useState("");
  const contextKey = JSON.stringify(stages);
  useEffect(() => {
    setPreview(null);
    setError("");
  }, [stage.script, stage.outputs, input, contextKey]);
  async function test() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const payload = JSON.parse(input);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Test input must be a JSON object");
      const output = await runJavaScript(stage.script || "", payload, stages);
      for (const key of Object.keys(output))
        if (!Object.hasOwn(stage.outputs || {}, key))
          throw new Error(`Declare an output type for ${key}`);
      for (const [key, field] of Object.entries(stage.outputs || {})) {
        const value = output[key];
        if (value == null) {
          if (field.required)
            throw new Error(`Missing required output: ${key}`);
          continue;
        }
        const type = Array.isArray(value) ? "array" : typeof value;
        if (type !== field.type)
          throw new Error(`${key} must be ${field.type}`);
      }
      setPreview(output);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="javascript-stage-editor">
      <div className="tool-section-heading">
        <span>
          <Code2 size={12} />
          CODE
        </span>
        <button disabled={busy} onClick={test}>
          {busy ? <Loader2 className="spin" size={12} /> : <Play size={12} />}
          Test code
        </button>
      </div>
      <p className="javascript-contract">
        Write a function body using <code>input</code> and <code>stages</code>.
        Return an object matching the outputs below.
      </p>
      <ExpressionEditor
        language="JavaScript"
        label="JavaScript source"
        value={stage.script || ""}
        onChange={(script) => {
          onChange({ script });
          setPreview(null);
          setError("");
        }}
        items={items}
        placeholder="return { value: input.value };"
      />
      <p className="javascript-context-note">
        Previous-stage outputs come from a run with the same input and unchanged
        ancestors. Run the workflow to populate or refresh them.
      </p>
      <div className="javascript-limits">
        Isolated QuickJS / WebAssembly · 100 ms · 8 MiB guest heap · JSON only ·
        no browser or network APIs
      </div>
      <div className="javascript-outputs">
        <span>OUTPUT CONTRACT</span>
        {Object.entries(stage.outputs || {}).map(([key, field]) => (
          <div key={key}>
            <code>{key}</code>
            <select
              aria-label={`${key} JavaScript output type`}
              value={field.type}
              onChange={(e) =>
                onChange({
                  outputs: {
                    ...stage.outputs,
                    [key]: { ...field, type: e.target.value as Field["type"] },
                  },
                })
              }
            >
              {["string", "number", "boolean", "object", "array"].map(
                (type) => (
                  <option key={type}>{type}</option>
                ),
              )}
            </select>
            <label>
              <input
                type="checkbox"
                aria-label={`${key} JavaScript output required`}
                checked={!!field.required}
                onChange={(e) =>
                  onChange({
                    outputs: {
                      ...stage.outputs,
                      [key]: { ...field, required: e.target.checked },
                    },
                  })
                }
              />
              Required
            </label>
            <button
              aria-label={`Remove JavaScript output ${key}`}
              onClick={() => {
                const outputs = { ...stage.outputs };
                delete outputs[key];
                onChange({ outputs });
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              /^[A-Za-z_][\w]*$/.test(name) &&
              !["__proto__", "constructor", "prototype"].includes(name) &&
              !Object.hasOwn(stage.outputs || {}, name)
            ) {
              onChange({
                outputs: {
                  ...stage.outputs,
                  [name]: { type: "string", required: true },
                },
              });
              setName("");
            }
          }}
        >
          <input
            aria-label="New JavaScript output name"
            placeholder="New output name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[A-Za-z_][A-Za-z_0-9]*"
          />
          <button
            disabled={!name || Object.hasOwn(stage.outputs || {}, name)}
            title="Add JavaScript output"
          >
            <Plus size={12} />
          </button>
        </form>
      </div>
      {error && (
        <div role="alert" className="javascript-error">
          {error}
        </div>
      )}
      {preview && (
        <div className="javascript-preview">
          <small>Code output · isolated test</small>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
