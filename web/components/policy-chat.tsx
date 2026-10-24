"use client";
import { evaluatePolicy, validatePolicy } from "@/lib/evaluate";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Info,
  CheckCheck,
  GitBranch,
  Loader2,
  MessageSquarePlus,
  Sparkles,
} from "lucide-react";
import { api, type Policy, type Run } from "@/lib/types";
import {
  payloadCompletions,
  stageCompletions,
  upstreamStages,
} from "@/lib/completions";
import { parseSimpleCondition, routeLabel } from "@/lib/rules";
import {
  auditIntent,
  filterRuns,
  findRun,
  recordRun,
  type RunRecord,
} from "@/lib/audit";
import { RunCard } from "./run-card";
import { RuleSentence } from "./rule-sentence";
import { Button } from "./ui/button";

type Turn = {
  role: "user" | "assistant";
  content: string;
  changes?: string[];
  revision?: number;
  runs?: RunRecord[];
};
type Conversation = {
  messages: Turn[];
  draft: Policy | null;
  revision: number;
};
export function PolicyChat({
  policy,
  conversationKey,
  mode,
  input,
  visible,
  run,
  request,
  records,
  onRecord,
  onRequestHandled,
  onApply,
}: {
  policy: Policy;
  conversationKey?: string;
  mode: string;
  input: string;
  visible: boolean;
  run: Run | null;
  records: RunRecord[];
  onRecord: (record: RunRecord) => void;
  request: { id: number; text: string } | null;
  onRequestHandled: () => void;
  onApply: (policy: Policy) => void;
}) {
  const storageKey = conversationKey || "policy-studio-conversation-v1";
  const [messages, setMessages] = useState<Turn[]>([]);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [revision, setRevision] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [draftView, setDraftView] = useState<"details" | "code" | null>(null);
  const inFlight = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const latestMessage = useRef<HTMLDivElement>(null);
  const consumed = useRef<number | null>(null);
  useEffect(() => {
    let mounted = true;
    async function restore() {
      try {
        const saved: Conversation = JSON.parse(
          localStorage.getItem(storageKey) || "null",
        );
        if (saved) {
          const turns = Array.isArray(saved.messages)
            ? saved.messages
                .filter(
                  (m) =>
                    ["user", "assistant"].includes(m.role) &&
                    typeof m.content === "string",
                )
                .slice(-120)
            : [];
          if (mounted) {
            setMessages(turns);
            setRevision(saved.revision || 0);
          }
          if (saved.draft) {
            await validatePolicy(saved.draft);
            if (mounted) setDraft(saved.draft);
          }
        }
      } catch {
        /* A malformed saved draft must not break the editor. */
      } finally {
        if (mounted) setReady(true);
      }
    }
    restore();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ messages: messages.slice(-120), draft, revision }),
        );
      } catch {
        setError("Conversation could not be stored in this browser.");
      }
  }, [messages, draft, revision, ready]);
  useEffect(() => {
    if (visible)
      latestMessage.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [messages, busy, revision, visible]);
  useEffect(() => {
    if (ready && request && !busy && consumed.current !== request.id) {
      consumed.current = request.id;
      send(request.text);
      onRequestHandled();
    }
  }, [request?.id, ready, busy]);
  async function send(text = prompt) {
    if (!ready || inFlight.current || applying || !text.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setPrompt("");
    const history = messages.slice(-40);
    let testInput: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(input);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      )
        testInput = parsed as Record<string, unknown>;
    } catch {}
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const intent = auditIntent(text);
      if (intent) {
        if (intent.kind === "runs") {
          const found = filterRuns(records, intent.target);
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: found.length
                ? `${found.length} saved run${found.length === 1 ? "" : "s"}${intent.target ? ` matching “${intent.target}”` : ""}. Showing ${Math.min(found.length, 10)}. Stored locally in this browser.`
                : "No saved runs match. Use /run to evaluate the current policy and payload.",
              runs: found.slice(0, 10),
            },
          ]);
        } else if (intent.kind === "run" || intent.kind === "replay") {
          const original =
            intent.kind === "replay"
              ? findRun(records, intent.target)
              : undefined;
          if (intent.kind === "replay" && !original)
            throw new Error(
              "Saved run not found, or the ID is ambiguous. Use /runs to choose a run.",
            );
          const executionPolicy = original?.policy || draft || policy;
          const payload =
            original?.input ||
            (intent.target ? JSON.parse(intent.target) : testInput);
          if (!payload || typeof payload !== "object" || Array.isArray(payload))
            throw new Error(
              "Provide a JSON object in the Test payload or after /run.",
            );
          const result = await evaluatePolicy(executionPolicy, payload);
          const record = recordRun(
            executionPolicy,
            payload,
            result,
            original?.id,
          );
          onRecord(record);
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: original
                ? `Replayed #${original.id} with its saved policy and input. ${result.outcome === original.result.outcome ? "The outcome is unchanged." : `The outcome changed from ${original.result.outcome} to ${result.outcome}.`}`
                : `Executed ${draft ? "the working draft" : "the current policy"} with ${intent.target ? "the supplied input" : "the test payload"}.`,
              runs: [record],
            },
          ]);
        } else {
          const record =
            /\bthis\b/i.test(text) && run
              ? records.find(
                  (r) =>
                    JSON.stringify(r.result) === JSON.stringify(run) &&
                    JSON.stringify(r.policy) === JSON.stringify(policy),
                )
              : findRun(records, intent.target);
          if (!record)
            throw new Error(
              "No matching saved run. Use /run first, or /runs to find its ID.",
            );
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `Here’s the recorded decision #${record.id}.`,
              runs: [record],
            },
          ]);
        }
        return;
      }
      if (text.trim() === "/help") {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "/run [JSON] — evaluate the current draft or policy\n/runs [outcome or policy] — search saved runs\n/audit [run ID] — explain a saved decision\n/replay [run ID] — rerun its saved policy and input\n/eligibility · /contract · /iot — start a template\n\nYou can also say “run this policy,” “show recent runs,” or “explain the last run.” Without an AI provider, authoring uses guided examples. Run history is local to this browser (latest 50), not a production audit log.",
          },
        ]);
        return;
      }
      const template = {
        "/eligibility": "Create an applicant eligibility policy",
        "/contract": "Build a contract review policy",
        "/iot": "Build an IoT device policy",
      }[text.trim()];
      if (text.startsWith("/") && !template)
        throw new Error(
          "Unknown command. Type /help to see available commands.",
        );
      const response = await api<{
        message: string;
        policy?: Policy;
        changes?: string[];
      }>("assistant", {
        prompt: template || text,
        policy,
        draft: draft || undefined,
        history: history.map((m) => ({
          role: m.role,
          content: (
            m.content +
            (m.runs?.length
              ? "\nRecorded execution evidence: " +
                JSON.stringify(
                  m.runs.map((r) => ({
                    id: r.id,
                    policyId: r.policy.id,
                    at: r.at,
                    input: r.input,
                    result: r.result,
                  })),
                )
              : "")
          ).slice(0, 12000),
        })),
        input: testInput,
        run: draft ? undefined : run || undefined,
      });
      const nextRevision = response.policy ? revision + 1 : undefined;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: response.message,
          changes: response.changes,
          revision: nextRevision,
        },
      ]);
      if (response.policy) {
        setDraft(response.policy);
        setRevision(nextRevision!);
        setDraftView(null);
      }
    } catch (err) {
      const message = (err as Error).message;
      setMessages((m) => [...m, { role: "assistant", content: message }]);
      setError(message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  function newChat() {
    if (inFlight.current) return;
    setMessages([]);
    setDraft(null);
    setRevision(0);
    setError("");
    setPrompt("");
    setDraftView(null);
  }
  async function apply() {
    if (!draft) return;
    setApplying(true);
    try {
      await validatePolicy(draft);
      onApply(draft);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Revision ${revision} is now in the editor. We can keep refining this policy here; save it when you’re ready.`,
        },
      ]);
      setDraft(null);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  }
  return (
    <section className="assistant sidebar-assistant">
      <div className="conversation-bar">
        <span>
          <span className="status-dot" />
          {mode === "demo" ? "Guided demo" : "AI connected"}
        </span>
        <span
          className="chat-help"
          tabIndex={0}
          aria-label="About the policy assistant"
        >
          <Info size={13} />
          <span role="tooltip">
            Let’s write the policy together. Describe what should happen,
            discuss edge cases, and refine the same draft. Use / commands for
            templates, execution, and auditing.{" "}
            {mode === "demo"
              ? "Configure an AI provider for open-ended authoring."
              : "Your conversation and draft stay in context."}
          </span>
        </span>
        <button title="New conversation" onClick={newChat} disabled={busy}>
          <MessageSquarePlus size={13} />
          New chat
        </button>
      </div>
      <div className="assistant-body" ref={scroller}>
        {messages.map((message, index) => (
          <div
            className={`message ${message.role}`}
            key={index}
            ref={index === messages.length - 1 ? latestMessage : undefined}
          >
            <small>
              {message.role === "user" ? (
                "YOU"
              ) : (
                <>
                  <Sparkles size={10} />
                  ASSISTANT
                  {message.revision && <span>REV {message.revision}</span>}
                </>
              )}
            </small>
            <p>{message.content}</p>
            {message.changes && message.changes.length > 0 && (
              <details className="chat-event">
                <summary>
                  Drafted revision {message.revision} · {message.changes.length}{" "}
                  changes
                </summary>
                <ul className="chat-changes">
                  {message.changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              </details>
            )}
            {message.runs?.map((record) => (
              <RunCard
                key={record.id}
                record={record}
                disabled={busy}
                onReplay={(id) => send(`/replay ${id}`)}
              />
            ))}
          </div>
        ))}
        {busy && (
          <div className="thinking">
            <Loader2 className="spin" size={14} />
            Thinking about your policy…
          </div>
        )}
        {draft && (
          <div className="working-policy">
            <div className="working-policy-heading">
              <GitBranch size={14} />
              <strong>Working policy</strong>
              <span>REV {revision}</span>
            </div>
            <h3>{draft.name}</h3>
            <div className="action-tabs">
              <button
                aria-pressed={draftView === "details"}
                onClick={() =>
                  setDraftView(draftView === "details" ? null : "details")
                }
              >
                Details
              </button>
              <button
                aria-pressed={draftView === "code"}
                onClick={() =>
                  setDraftView(draftView === "code" ? null : "code")
                }
              >
                Code
              </button>
            </div>
            <div className="policy-artifact">
              <GitBranch size={13} />
              <span>policies/{draft.id}</span>
              <small>Draft</small>
            </div>
            {draftView === "code" && (
              <pre className="action-code">
                {JSON.stringify(draft, null, 2)}
              </pre>
            )}
            {draftView === "details" && (
              <>
                <p className="working-policy-description">
                  {draft.description}
                </p>
                <div className="draft-rule-list">
                  {draft.edges.map((edge) => {
                    const group =
                      edge.rules || parseSimpleCondition(edge.condition || "");
                    const items = [
                      ...payloadCompletions(
                        JSON.stringify(draft.exampleInput || {}),
                        draft.inputSchema,
                      ).items,
                      ...stageCompletions(
                        upstreamStages(draft, edge.from, true),
                      ),
                    ];
                    return (
                      <div className="draft-rule" key={edge.id}>
                        <div>
                          <span
                            className={edge.default ? "else-badge" : "if-badge"}
                          >
                            {edge.default ? "ELSE" : "IF"}
                          </span>
                          <strong>{routeLabel(edge, draft)}</strong>
                        </div>
                        {group ? (
                          <RuleSentence
                            group={group}
                            policy={draft}
                            items={items}
                            onChange={(rules) =>
                              setDraft({
                                ...draft,
                                edges: draft.edges.map((e) =>
                                  e.id === edge.id
                                    ? { ...e, rules, condition: undefined }
                                    : e,
                                ),
                              })
                            }
                          />
                        ) : (
                          <p>
                            {edge.default
                              ? "No earlier case matched."
                              : `Continue to ${draft.stages.find((s) => s.id === edge.to)?.name || edge.to}.`}
                          </p>
                        )}
                        <span className="draft-rule-outcome">
                          Then{" "}
                          {draft.stages.find((s) => s.id === edge.to)?.name ||
                            edge.to}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <div className="working-policy-actions">
              <Button size="sm" onClick={apply} disabled={busy || applying}>
                {applying ? <Loader2 className="spin" /> : <CheckCheck />}Apply
                revision
              </Button>
              <span>Or keep refining in chat ↓</span>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="chat-error">
            {error}
          </div>
        )}
      </div>
      {prompt.startsWith("/") && (
        <div className="slash-commands" role="group" aria-label="Chat commands">
          {[
            ["/run", "Evaluate"],
            ["/runs", "Run history"],
            ["/audit", "Explain last run"],
            ["/replay", "Replay last run"],
            ["/eligibility", "Eligibility template"],
            ["/contract", "Contract template"],
            ["/iot", "IoT template"],
            ["/help", "All commands"],
          ]
            .filter(([command]) => command.startsWith(prompt.split(" ")[0]))
            .map(([command, label]) => (
              <button key={command} onClick={() => setPrompt(command)}>
                <code>{command}</code>
                <span>{label}</span>
              </button>
            ))}
        </div>
      )}
      <form
        className="prompt"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label="Ask the policy assistant"
          maxLength={8000}
          placeholder={
            draft
              ? "Refine this draft, add an exception…"
              : "Ask about a policy or run… (/ for commands)"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!busy && !applying) send();
            }
          }}
        />
        <div>
          <span>
            {draft
              ? `Continuing revision ${revision}`
              : "Shift + Enter for a new line"}
          </span>
          <Button
            size="icon"
            title="Send prompt"
            disabled={!ready || busy || applying || !prompt.trim()}
          >
            <ArrowUp />
          </Button>
        </div>
      </form>
    </section>
  );
}
