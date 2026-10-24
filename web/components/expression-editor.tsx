"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Braces } from "lucide-react";
import {
  completionContext,
  insertCompletion,
  matchingCompletions,
  shouldSuggest,
  type Completion,
} from "@/lib/completions";

export function ExpressionEditor({
  label,
  language = "Expr",
  value,
  onChange,
  items,
  placeholder = "input.",
}: {
  label: string;
  language?: "Expr" | "JavaScript";
  value: string;
  onChange: (value: string) => void;
  items: Completion[];
  placeholder?: string;
}) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [forced, setForced] = useState(false);
  const context = completionContext(value, caret);
  const matches = matchingCompletions(items, context);
  const visible =
    open && matches.length > 0 && shouldSuggest(value, caret, context, forced);
  useEffect(() => {
    if (visible)
      document
        .getElementById(`${id}-${Math.min(active, matches.length - 1)}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, visible, id, matches.length]);
  function apply(item: Completion) {
    const inserted = insertCompletion(value, context, item.path);
    onChange(inserted.value);
    setCaret(inserted.caret);
    setOpen(false);
    setForced(false);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(inserted.caret, inserted.caret);
    });
  }
  return (
    <div
      className="expression-editor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <textarea
        ref={area}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={visible ? id : undefined}
        aria-activedescendant={
          visible ? `${id}-${Math.min(active, matches.length - 1)}` : undefined
        }
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        onChange={(event) => {
          setCaret(event.target.selectionStart);
          setForced(false);
          setActive(0);
          setOpen(true);
          onChange(event.target.value);
        }}
        onClick={(event) => {
          setForced(false);
          setCaret(event.currentTarget.selectionStart);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
            event.preventDefault();
            setCaret(event.currentTarget.selectionStart);
            setForced(true);
            setOpen(true);
            setActive(0);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (
            visible &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();
            setActive(
              (index) =>
                (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  matches.length) %
                matches.length,
            );
            return;
          }
          if (visible && (event.key === "Enter" || event.key === "Tab")) {
            event.preventDefault();
            apply(matches[Math.min(active, matches.length - 1)]);
            return;
          }
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            setOpen(false);
            requestAnimationFrame(() =>
              setCaret(area.current?.selectionStart || 0),
            );
          }
        }}
      />
      {visible && (
        <div
          className="completion-menu"
          id={id}
          role="listbox"
          aria-label={`${label} suggestions`}
        >
          <div className="completion-title">
            <Braces size={12} />
            Fields in scope<span>↑ ↓ · Enter / Tab</span>
          </div>
          {matches.map((item, index) => (
            <button
              type="button"
              role="option"
              id={`${id}-${index}`}
              aria-selected={index === Math.min(active, matches.length - 1)}
              key={item.path}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => apply(item)}
              onMouseEnter={() => setActive(index)}
            >
              <span>
                <code>{item.path}</code>
                <small>{item.preview}</small>
              </span>
              <em>{item.type}</em>
            </button>
          ))}
        </div>
      )}
      <div className="expression-help">
        <span>{language}</span>
        <span>Ctrl / ⌘ Space for fields</span>
      </div>
    </div>
  );
}
