"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import {
  addPayloadField,
  emptyValue,
  jsonType,
  parseFormNumber,
  parsePayload,
  removePayloadValue,
  renamePayloadField,
  setPayloadValue,
  valueAt,
  type JsonObject,
  type JsonType,
  type JsonValue,
  type PayloadPath,
} from "@/lib/payload-form";

const types: JsonType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "null",
];
const pathLabel = (path: PayloadPath) =>
  path.reduce<string>(
    (text, key) =>
      typeof key === "number"
        ? `${text}[${key}]`
        : `${text}[${JSON.stringify(key)}]`,
    "input",
  );
type Report = (key: string, message: string) => void;

function NumberValue({
  value,
  label,
  onChange,
  report,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
  report: Report;
}) {
  const [text, setText] = useState(String(value));
  const issue = `number:${label}`;
  useEffect(() => {
    setText(String(value));
    report(issue, "");
  }, [value, issue, report]);
  useEffect(() => () => report(issue, ""), [issue, report]);
  const invalid = parseFormNumber(text) === undefined;
  return (
    <input
      aria-label={`Value ${label}`}
      type="text"
      inputMode="decimal"
      value={text}
      aria-invalid={invalid}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const number = parseFormNumber(next);
        report(
          issue,
          number === undefined ? `${label}: enter a finite number.` : "",
        );
        if (number !== undefined) onChange(number);
      }}
    />
  );
}
function FieldName({
  name,
  path,
  root,
  onChange,
  report,
}: {
  name: string;
  path: PayloadPath;
  root: JsonObject;
  onChange: (root: JsonObject) => void;
  report: Report;
}) {
  const [text, setText] = useState(name),
    [error, setError] = useState("");
  const label = pathLabel(path),
    issue = `name:${label}`;
  useEffect(() => () => report(issue, ""), [issue, report]);
  function check(next: string) {
    try {
      renamePayloadField(root, path, next);
      setError("");
      report(issue, "");
      return true;
    } catch (error) {
      const message = (error as Error).message;
      setError(message);
      report(issue, `${label}: ${message}`);
      return false;
    }
  }
  function commit() {
    if (check(text) && text !== name)
      onChange(renamePayloadField(root, path, text) as JsonObject);
  }
  return (
    <input
      aria-label={`Field name ${label}`}
      value={text}
      title={error || "Field name"}
      aria-invalid={!!error}
      onChange={(event) => {
        setText(event.target.value);
        check(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          setText(name);
          setError("");
          report(issue, "");
        }
      }}
    />
  );
}
function FieldRow({
  root,
  path,
  onChange,
  report,
  onJSON,
}: {
  root: JsonObject;
  path: PayloadPath;
  onChange: (root: JsonObject) => void;
  report: Report;
  onJSON: () => void;
}) {
  const value = valueAt(root, path),
    type = jsonType(value),
    container = type === "object" || type === "array";
  const label = pathLabel(path),
    key = path[path.length - 1];
  const [expanded, setExpanded] = useState(
    typeof key !== "number" || key === 0,
  );
  function set(value: JsonValue) {
    onChange(setPayloadValue(root, path, value) as JsonObject);
  }
  return (
    <div className="payload-field">
      <div className="payload-field-header schema-field">
        {container ? (
          <button
            type="button"
            className="payload-fold"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="payload-leaf" />
        )}
        {typeof key === "number" ? (
          <span className="payload-array-index">[{key}]</span>
        ) : (
          <FieldName
            name={key}
            path={path}
            root={root}
            onChange={onChange}
            report={report}
          />
        )}
        <select
          aria-label={`Type ${label}`}
          value={type}
          onChange={(event) => {
            set(emptyValue(event.target.value as JsonType));
            setExpanded(true);
          }}
        >
          {types.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <button
          type="button"
          className="payload-remove"
          aria-label={`Remove ${label}`}
          title="Remove field"
          onClick={() => onChange(removePayloadValue(root, path) as JsonObject)}
        >
          <X size={12} />
        </button>
      </div>
      {container ? (
        <div className="payload-children" hidden={!expanded}>
          {path.length >= 16 ? (
            <button className="payload-add" onClick={onJSON} type="button">
              Edit deeper fields in JSON
            </button>
          ) : (
            <>
              {(Array.isArray(value)
                ? value.map((_, index) => index)
                : Object.keys(value as JsonObject)
              ).map((key) => (
                <FieldRow
                  key={JSON.stringify([...path, key])}
                  root={root}
                  path={[...path, key]}
                  onChange={onChange}
                  report={report}
                  onJSON={onJSON}
                />
              ))}
              <button
                type="button"
                className="payload-add"
                onClick={() =>
                  onChange(addPayloadField(root, path) as JsonObject)
                }
              >
                <Plus size={12} />
                {type === "array" ? "Add item" : "Add subfield"}
                <span className="sr-only"> to {label}</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="payload-field-value">
          {type === "string" ? (
            <input
              aria-label={`Value ${label}`}
              type="text"
              value={value as string}
              placeholder="Text value"
              onChange={(event) => set(event.target.value)}
            />
          ) : type === "number" ? (
            <NumberValue
              value={value as number}
              label={label}
              onChange={set}
              report={report}
            />
          ) : type === "boolean" ? (
            <label className="payload-boolean">
              <input
                type="checkbox"
                role="switch"
                aria-label={`Value ${label}`}
                checked={value as boolean}
                onChange={(event) => set(event.target.checked)}
              />
              <span>{value ? "true" : "false"}</span>
            </label>
          ) : (
            <span className="payload-null">null</span>
          )}
        </div>
      )}
    </div>
  );
}

export function PayloadEditor({
  value,
  onChange,
  onValidityChange,
  label = "Test payload",
}: {
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (valid: boolean) => void;
  label?: string;
}) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const report = useCallback<Report>(
    (key, message) =>
      setIssues((previous) => {
        if ((previous[key] || "") === message) return previous;
        const next = { ...previous };
        if (message) next[key] = message;
        else delete next[key];
        return next;
      }),
    [],
  );
  const parsed = parsePayload(value),
    messages = Object.values(issues),
    valid = !!parsed.value && !messages.length;
  const id = useId();
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);
  const change = (root: JsonObject) => onChange(JSON.stringify(root, null, 2));
  return (
    <div className="test-payload-editor" aria-label={`${label} editor`}>
      <div
        className="payload-view-toggle"
        role="tablist"
        aria-label={`${label} view`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "form"}
          aria-controls={`${id}-form`}
          disabled={!parsed.value && mode === "json"}
          title={!parsed.value ? parsed.error : "Edit fields"}
          onClick={() => setMode("form")}
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "json"}
          aria-controls={`${id}-json`}
          disabled={messages.length > 0}
          title={
            messages.length
              ? "Finish editing the highlighted field first"
              : "Edit JSON"
          }
          onClick={() => setMode("json")}
        >
          JSON
        </button>
      </div>
      {mode === "json" ? (
        <textarea
          id={`${id}-json`}
          aria-label={
            label === "Test payload" ? "JSON input" : `${label} JSON input`
          }
          className="payload-editor"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div
          id={`${id}-form`}
          className="payload-form"
          role="tabpanel"
          aria-label={`${label} form`}
        >
          {parsed.value ? (
            <>
              {Object.keys(parsed.value).map((key) => (
                <FieldRow
                  key={key}
                  root={parsed.value!}
                  path={[key]}
                  onChange={change}
                  report={report}
                  onJSON={() => {
                    if (!messages.length) setMode("json");
                  }}
                />
              ))}
              {!Object.keys(parsed.value).length && (
                <p className="payload-form-empty">
                  Add fields to build your test input.
                </p>
              )}
              <button
                type="button"
                className="payload-add payload-add-root"
                onClick={() =>
                  change(addPayloadField(parsed.value!, []) as JsonObject)
                }
              >
                <Plus size={12} />
                Add field
              </button>
            </>
          ) : (
            <button
              type="button"
              className="payload-add"
              onClick={() => setMode("json")}
            >
              Edit JSON to repair this payload
            </button>
          )}
        </div>
      )}
      {(parsed.error || messages.length > 0) && (
        <p className="payload-form-error" role="alert">
          {parsed.error || messages[0]}
        </p>
      )}
    </div>
  );
}
