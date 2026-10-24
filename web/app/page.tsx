"use client";
import { isRouter, normalizeRouting, resolvedRouting } from "@/lib/routing";
import { evaluatePolicy, validatePolicy } from "@/lib/evaluate";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Connection } from "@xyflow/react";
import {
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  GitBranch,
  FolderOpen,
  Layers,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { BlockLibrary } from "@/components/block-library";
import { JavaScriptEditor } from "@/components/javascript-editor";
import { addConnectedStage, connectStages } from "@/lib/canvas-actions";
import { PayloadEditor } from "@/components/payload-editor";
import { SavedTests } from "@/components/saved-tests";
import { WorkspaceNavigator } from "@/components/workspace-navigator";
import {
  createWorkspace,
  restoreWorkspace,
  editDocument,
  documentPolicy,
  workspaceKey,
  type Workspace,
} from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { ExpressionEditor } from "@/components/expression-editor";
import { recordRun, runStorageKey, type RunRecord } from "@/lib/audit";
import { PolicyChat } from "@/components/policy-chat";
import { SwitchCases } from "@/components/switch-cases";
import { routeLabel } from "@/lib/rules";
import { PolicyOverview } from "@/components/policy-overview";
import { WorkflowCanvas } from "@/components/workflow-canvas";
import {
  payloadCompletions,
  stageCompletions,
  upstreamStages,
} from "@/lib/completions";
import {
  api,
  type Policy,
  type Stage,
  type Run,
  type Field,
} from "@/lib/types";
const pretty = (v: unknown) => JSON.stringify(v, null, 2);
export default function Studio() {
  const [policy, setPolicy] = useState<Policy | null>(null),
    [selected, setSelected] = useState(""),
    [selectedEdge, setSelectedEdge] = useState(""),
    [leftTab, setLeftTab] = useState<
      "policy" | "test" | "assistant" | "blocks"
    >("assistant"),
    [leftCollapsed, setLeftCollapsed] = useState(false),
    [rightCollapsed, setRightCollapsed] = useState(false),
    [traceOpen, setTraceOpen] = useState(false),
    [runInput, setRunInput] = useState(""),
    [tab, setTab] = useState("canvas"),
    [raw, setRaw] = useState(""),
    [input, setInput] = useState(""),
    [run, setRun] = useState<Run | null>(null),
    [runPolicy, setRunPolicy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState("demo"),
    [chatRequest, setChatRequest] = useState<{
      id: number;
      text: string;
    } | null>(null),
    [newField, setNewField] = useState("");
  const [inputFormValid, setInputFormValid] = useState(true);
  const [payloadRevision, setPayloadRevision] = useState(0);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(true);
  const [dockTab, setDockTab] = useState<"stage" | "trace">("stage");
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(runStorageKey) || "[]");
      if (Array.isArray(saved))
        setRecords(
          saved
            .filter(
              (r) =>
                r.id && r.at && r.policy?.stages && r.input && r.result?.trace,
            )
            .slice(0, 50),
        );
    } catch {
      /* Ignore malformed local history. */
    }
    setHistoryReady(true);
  }, []);
  useEffect(() => {
    if (!historyReady) return;
    try {
      localStorage.setItem(runStorageKey, JSON.stringify(records));
    } catch {
      setNotice(
        "Run history could not be saved; it is available for this session only.",
      );
    }
  }, [records, historyReady]);
  function rememberRun(record: RunRecord) {
    setRecords((previous) =>
      [
        { ...record, documentId: workspace?.activeDocumentId },
        ...previous,
      ].slice(0, 50),
    );
    try {
      if (
        policy &&
        pretty(record.policy) === pretty(policy) &&
        pretty(record.input) === pretty(JSON.parse(input))
      ) {
        setRun(record.result);
        setRunPolicy(pretty(policy));
        setRunInput(input);
      }
    } catch {
      /* An edited, incomplete payload does not match a saved run. */
    }
  }
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    Promise.all([api<Policy[]>("samples"), api<{ aiMode: string }>("health")])
      .then(async ([s, h]) => {
        setMode(h.aiMode);
        let first = s[0];
        try {
          const layout = JSON.parse(
            localStorage.getItem("policy-studio-layout-v3") || "{}",
          );
          const compact = window.matchMedia("(max-width: 900px)").matches;
          setLeftCollapsed(compact || layout.left === true);
          setRightCollapsed(compact || layout.right === true);
        } catch {}
        try {
          const saved = localStorage.getItem("policy-studio");
          if (saved) {
            const restored = JSON.parse(saved) as Policy;
            await api("validate", restored);
            first = restored;
          }
        } catch {}
        const restored = restoreWorkspace(
          localStorage.getItem(workspaceKey),
          createWorkspace(s, first),
        );
        setWorkspace(restored);
        const active = restored.documents.find(
          (document) => document.id === restored.activeDocumentId,
        );
        if (!active) {
          setPolicy(null);
          return;
        }
        const chatKey = "policy-studio-conversation-v1:" + active.id;
        if (
          !localStorage.getItem(chatKey) &&
          !localStorage.getItem("policy-studio-chat-migrated")
        ) {
          const legacy = localStorage.getItem("policy-studio-conversation-v1");
          if (legacy) localStorage.setItem(chatKey, legacy);
          localStorage.setItem("policy-studio-chat-migrated", "true");
        }
        load(documentPolicy(active));
        if (active.testInput !== undefined) setInput(active.testInput);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const resize = () => {
      if (media.matches) {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      }
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!workspace) return;
    try {
      localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    } catch {
      setNotice("Workspace changes could not be stored in this browser.");
    }
  }, [workspace]);
  useEffect(() => {
    if (!workspace) return;
    setWorkspace((current) =>
      current
        ? {
            ...current,
            documents: current.documents.map((document) =>
              document.id === current.activeDocumentId
                ? { ...document, testInput: input }
                : document,
            ),
          }
        : current,
    );
  }, [input, workspace?.activeDocumentId]);
  function openDocument(id: string, view: "policy" | "canvas" = "canvas") {
    const document = workspace?.documents.find(
      (document) => document.id === id,
    );
    if (!document) return;
    setWorkspace((current) =>
      current
        ? {
            ...current,
            activeDocumentId: id,
            activeProjectId: document.projectId,
          }
        : current,
    );
    load(documentPolicy(document));
    if (document.testInput !== undefined) setInput(document.testInput);
    setTab(view);
    setDockCollapsed(true);
  }
  function changeWorkspace(
    next: Workspace,
    view: "policy" | "canvas" = "canvas",
  ) {
    setWorkspace(next);
    const active = next.documents.find(
      (document) => document.id === next.activeDocumentId,
    );
    if (!active) {
      setPolicy(null);
      setInput("{}");
      setRun(null);
      setDockCollapsed(true);
      return;
    }
    if (next.activeDocumentId !== workspace?.activeDocumentId) {
      load(documentPolicy(active));
      if (active.testInput !== undefined) setInput(active.testInput);
      setTab(view);
      setDockCollapsed(true);
    } else {
      const previous = workspace?.documents.find(
        (document) => document.id === next.activeDocumentId,
      );
      if (previous && documentPolicy(previous) !== documentPolicy(active)) {
        setPolicy(documentPolicy(active));
        setRaw(pretty(documentPolicy(active)));
      }
    }
  }

  function importDocument(next: Policy) {
    if (!workspace) return;
    const active = workspace.documents.find(
      (document) => document.id === workspace.activeDocumentId,
    )!;
    const document = {
      id: crypto.randomUUID(),
      projectId: active.projectId,
      folderId: active.folderId,
      policy: next,
    };
    changeWorkspace({
      ...workspace,
      documents: [...workspace.documents, document],
      activeDocumentId: document.id,
    });
  }
  function load(p: Policy) {
    setPayloadRevision((previous) => previous + 1);
    setInputFormValid(true);
    p = normalizeRouting(p);
    setPolicy(p);
    setRaw(pretty(p));
    setInput(pretty(p.exampleInput || {}));
    setSelected(p.stages[0]?.id || "");
    setSelectedEdge("");
    setRun(null);
    setError("");
    setNotice("");
  }
  function update(p: Policy) {
    p = normalizeRouting(p);
    setPolicy(p);
    setRaw(pretty(p));
    setWorkspace((current) =>
      current ? editDocument(current, current.activeDocumentId, p) : current,
    );
    setNotice("");
  }
  async function validate(p: Policy) {
    await validatePolicy(p);
  }
  async function save() {
    if (!policy) return;
    try {
      await validate(policy);
      localStorage.setItem("policy-studio", pretty(policy));
      setWorkspace((current) =>
        current
          ? editDocument(current, current.activeDocumentId, policy, true)
          : current,
      );
      setNotice("Validated and saved in this browser.");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function evaluate() {
    if (!policy || !inputFormValid) return;
    setBusy(true);
    setError("");
    setTraceOpen(true);
    setDockCollapsed(false);
    setDockTab("trace");
    try {
      const payload = JSON.parse(input);
      if (
        payload === null ||
        Array.isArray(payload) ||
        typeof payload !== "object"
      )
        throw new Error("Input must be a JSON object");
      const result = await evaluatePolicy(policy, payload);
      rememberRun(recordRun(policy, payload, result));
      setRun(result);
      setRunPolicy(pretty(policy));
      setRunInput(input);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function ask(text: string) {
    openLeft("assistant");
    setChatRequest({ id: Date.now(), text });
  }
  function applyChatPolicy(next: Policy) {
    const changed = next.id !== policy?.id;
    update(next);
    if (changed) setInput(pretty(next.exampleInput || {}));
    selectStage(next.stages[0]?.id || "");
    setNotice("Conversation revision applied. Run a test and save when ready.");
  }
  async function applyRaw() {
    try {
      const p = JSON.parse(raw) as Policy;
      await validate(p);
      update(p);
      selectStage(p.stages[0]?.id || "");
      setNotice("Policy JSON applied.");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download() {
    if (!policy) return;
    const url = URL.createObjectURL(
      new Blob([pretty(policy)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = policy.id + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function addStage(kind: Stage["kind"] = "transform") {
    if (!policy) return;
    const id = "stage_" + Date.now().toString(36);
    if (kind === "if" || kind === "switch") {
      const target =
        selected ||
        policy.edges.find((edge) => edge.id === selectedEdge)?.to ||
        policy.stages[0].id;
      const fallbackId = `${id}_review`;
      const yes = `${id}_true`,
        no = `${id}_false`;
      const router: Stage = {
        id,
        kind,
        name: kind === "if" ? "IF" : "Switch",
        explanation: "",
        cases: [
          {
            id: yes,
            label: kind === "if" ? "True" : "Matching case",
            condition: "false",
            order: 1,
          },
          {
            id: no,
            label: kind === "if" ? "False" : "Otherwise",
            default: true,
            order: 2,
          },
        ],
      };
      update({
        ...policy,
        stages: [
          ...policy.stages,
          router,
          {
            id: fallbackId,
            name: "Review",
            kind: "decision",
            outcome: "FLAG",
            explanation: "The condition did not match.",
          },
        ],
        edges: [
          ...policy.edges.map((edge) =>
            edge.to === target ? { ...edge, to: id } : edge,
          ),
          { id: yes, from: id, to: target },
          { id: no, from: id, to: fallbackId },
        ],
      });
      selectStage(id);
      return;
    }
    const s: Stage = {
      id,
      name:
        kind === "decision"
          ? "New decision"
          : kind === "javascript"
            ? "Code"
            : "New evaluation",
      kind,
      ...(kind === "decision"
        ? { outcome: "PASS" }
        : kind === "javascript"
          ? {
              outputs: { value: { type: "number" as const, required: true } },
              script: "return { value: Number(input.value ?? 0) };",
            }
          : {
              outputs: {
                value: { type: "boolean" as const, required: true },
              },
              expressions: { value: "true" },
            }),
      explanation: "Describe this stage.",
    };
    if (kind === "javascript") {
      const target =
        selected ||
        policy.edges.find((edge) => edge.id === selectedEdge)?.from ||
        policy.stages[0]?.id;
      update({
        ...policy,
        stages: [...policy.stages, s],
        edges: target
          ? [
              ...policy.edges.map((edge) =>
                edge.to === target ? { ...edge, to: id } : edge,
              ),
              {
                id: "route_" + id,
                from: id,
                to: target,
                label: "Code complete",
                condition: "true",
              },
            ]
          : policy.edges,
      });
    } else update({ ...policy, stages: [...policy.stages, s] });
    selectStage(id);
  }
  function connect(c: Connection) {
    if (!policy || !c.source || !c.target) return;
    try {
      update(connectStages(policy, c.source, c.target, c.sourceHandle));
      selectStage(c.source);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  function createFromConnection(
    source: string,
    handle: string | null,
    kind: Stage["kind"],
    outcome?: string,
  ) {
    if (!policy) return;
    try {
      const next = addConnectedStage(policy, source, handle, kind, outcome);
      update(next.policy);
      selectStage(next.id);
      return next.id;
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  function selectStage(id: string) {
    setSelected(id);
    setSelectedEdge("");
    setDockCollapsed(false);
    setDockTab("stage");
  }
  function selectEdge(id: string) {
    const route = policy?.edges.find((edge) => edge.id === id);
    if (
      route &&
      isRouter(policy?.stages.find((stage) => stage.id === route.from))
    ) {
      selectStage(route.from);
      return;
    }
    setSelectedEdge(id);
    setSelected("");
    setDockCollapsed(false);
    setDockTab("stage");
  }
  function openLeft(tab: typeof leftTab) {
    setLeftTab(tab);
    setRightCollapsed(false);
    if (window.matchMedia("(max-width: 900px)").matches) setLeftCollapsed(true);
  }
  function togglePanel(side: "left" | "right") {
    let left = side === "left" ? !leftCollapsed : leftCollapsed;
    let right = side === "right" ? !rightCollapsed : rightCollapsed;
    if (window.matchMedia("(max-width: 900px)").matches) {
      if (side === "left" && !left) right = true;
      if (side === "right" && !right) left = true;
    }
    setLeftCollapsed(left);
    setRightCollapsed(right);
    try {
      localStorage.setItem(
        "policy-studio-layout-v3",
        JSON.stringify({ left, right }),
      );
    } catch {}
  }
  if (!workspace)
    return (
      <main className="loading">
        <Layers />
        <p>{error || "Opening your workspace…"}</p>
      </main>
    );
  if (!policy)
    return (
      <div className="app-shell studio-v3">
        <div className="workspace">
          <header className="compact-header">
            <div className="compact-document">
              <Layers size={16} />
              <h1>
                {workspace.projects.find(
                  (project) => project.id === workspace.activeProjectId,
                )?.name || "Policy / Studio"}
              </h1>
            </div>
          </header>
          <div
            className={`studio-grid ${leftCollapsed ? "left-collapsed" : ""}`}
            style={
              {
                "--left-width": leftCollapsed ? "40px" : "232px",
                "--right-width": "0px",
              } as CSSProperties
            }
          >
            <WorkspaceNavigator
              workspace={workspace}
              collapsed={leftCollapsed}
              onToggle={() => togglePanel("left")}
              onChange={changeWorkspace}
              onOpen={openDocument}
            />
            <main className="explorer-empty-workspace">
              <FolderOpen size={28} />
              <h2>No workflow open</h2>
              <p>
                Create a workflow using the explorer, or restore one from Trash.
              </p>
            </main>
          </div>
          <footer className="studio-footer">
            Local workspace · changes are saved in this browser
          </footer>
        </div>
      </div>
    );
  const stage = policy.stages.find((s) => s.id === selected);
  const edge = policy.edges.find((e) => e.id === selectedEdge);
  const fresh = runPolicy === pretty(policy) && runInput === input;
  const payload = payloadCompletions(input, policy.inputSchema);
  const scope = edge
    ? upstreamStages(policy, edge.from, true)
    : stage
      ? upstreamStages(policy, stage.id, false)
      : [];
  const completions = [...payload.items, ...stageCompletions(scope)];
  let codeContext: Record<string, unknown> = {};
  if (run && runInput === input && stage?.kind === "javascript") {
    try {
      const previous = JSON.parse(runPolicy) as Policy;
      const ids = new Set(scope.map((ancestor) => ancestor.id));
      if (
        pretty(previous.inputSchema) === pretty(policy.inputSchema) &&
        pretty(upstreamStages(previous, stage.id, false)) === pretty(scope) &&
        pretty(previous.edges.filter((edge) => ids.has(edge.to))) ===
          pretty(policy.edges.filter((edge) => ids.has(edge.to)))
      ) {
        codeContext = Object.fromEntries(
          run.trace
            .filter((entry) => ids.has(entry.stageId) && entry.outputs)
            .map((entry) => [entry.stageId, entry.outputs]),
        );
      }
    } catch {
      /* A missing run snapshot cannot supply ancestor outputs. */
    }
  }

  function editStage(patch: Partial<Stage>) {
    if (policy && stage)
      update({
        ...policy,
        stages: policy.stages.map((s) =>
          s.id === stage.id ? { ...s, ...patch } : s,
        ),
      });
  }
  function editEdge(patch: Partial<Policy["edges"][number]>) {
    if (policy && edge)
      update({
        ...policy,
        edges: policy.edges.map((e) =>
          e.id === edge.id ? { ...e, ...patch } : e,
        ),
      });
  }
  function addInputField() {
    if (
      !policy ||
      !newField.trim() ||
      Object.hasOwn(policy.inputSchema, newField.trim())
    )
      return;
    update({
      ...policy,
      inputSchema: {
        ...policy.inputSchema,
        [newField.trim()]: { type: "string", required: true },
      },
    });
    setNewField("");
  }
  return (
    <div className="app-shell studio-v3">
      <div className="workspace">
        <header className="compact-header">
          <div className="compact-document">
            <Layers size={16} />
            <span>
              {
                workspace.projects.find(
                  (project) =>
                    project.id ===
                    workspace.documents.find(
                      (document) => document.id === workspace.activeDocumentId,
                    )?.projectId,
                )?.name
              }
            </span>
            <ChevronRight size={12} />
            <h1>{policy.name}</h1>
            {workspace.documents.find(
              (document) => document.id === workspace.activeDocumentId,
            )?.draft && (
              <span className="unsaved-dot" title="Unvalidated draft" />
            )}
          </div>
          <div className="heading-actions">
            <span className="runtime-label">
              <span className="status-dot" />
              Local
            </span>
            <Button
              variant="ghost"
              size="icon"
              title="Export policy"
              onClick={download}
            >
              <Download />
            </Button>
            <Button variant="outline" size="sm" onClick={save}>
              <Save />
              Save
            </Button>
            <Button
              size="sm"
              onClick={evaluate}
              disabled={busy || !inputFormValid}
            >
              {busy ? <Loader2 className="spin" /> : <Play />}Run
            </Button>
          </div>
        </header>
        <div
          className={`studio-grid ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""}`}
          style={
            {
              "--left-width": leftCollapsed ? "40px" : "232px",
              "--right-width": rightCollapsed ? "40px" : "350px",
            } as CSSProperties
          }
        >
          <WorkspaceNavigator
            workspace={workspace}
            collapsed={leftCollapsed}
            onToggle={() => togglePanel("left")}
            onChange={changeWorkspace}
            onOpen={openDocument}
          />
          <main className="editor-column">
            <div className="editor-bar">
              <div className="tabs">
                <button
                  className={tab === "policy" ? "on" : ""}
                  title="Rules and decisions in this workflow"
                  onClick={() => setTab("policy")}
                >
                  <Layers size={14} />
                  Overview
                </button>
                <button
                  className={tab === "canvas" ? "on" : ""}
                  onClick={() => setTab("canvas")}
                >
                  <GitBranch size={14} />
                  Workflow
                </button>
                <button
                  className={tab === "json" ? "on" : ""}
                  onClick={() => setTab("json")}
                >
                  <Braces size={14} />
                  Definition
                </button>
              </div>
              <div className="editor-actions">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Import policy JSON"
                  onClick={() => upload.current?.click()}
                >
                  <Upload />
                </Button>
                <input
                  ref={upload}
                  type="file"
                  hidden
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const imported = JSON.parse(await file.text());
                      await validate(imported);
                      importDocument(imported);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {error && (
              <div role="alert" className="alert">
                {error}
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  <X size={14} />
                </button>
              </div>
            )}
            {notice && (
              <div role="status" className="notice">
                <Check size={13} />
                {notice}
              </div>
            )}
            <div className="canvas-area">
              {tab === "policy" ? (
                <PolicyOverview
                  policy={resolvedRouting(policy)}
                  input={input}
                  run={run}
                  fresh={fresh}
                  onChange={update}
                  onStage={selectStage}
                  onEdge={selectEdge}
                />
              ) : tab === "canvas" ? (
                <>
                  <div className="canvas-label">
                    <span className="status-dot" /> DETERMINISTIC WORKFLOW{" "}
                    <span>v{policy.version}</span>
                  </div>
                  <WorkflowCanvas
                    key={policy.id}
                    policy={policy}
                    selectedStage={selected}
                    selectedEdge={selectedEdge}
                    run={run}
                    fresh={fresh}
                    onStage={selectStage}
                    onEdge={selectEdge}
                    onConnect={connect}
                    onCreateConnected={createFromConnection}
                  />
                  <div className="canvas-instruction">
                    Select IF or Switch to edit routing
                  </div>
                  <span className="canvas-footnote">
                    {policy.stages.length} stages · {policy.edges.length} routes
                  </span>
                </>
              ) : (
                <div className="definition">
                  <div>
                    <span>Portable policy definition</span>
                    <Button size="sm" onClick={applyRaw}>
                      <Check />
                      Validate & apply
                    </Button>
                  </div>
                  <textarea
                    aria-label="Workflow JSON"
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              )}
            </div>

            <section
              className={`bottom-dock ${dockCollapsed ? "dock-collapsed" : ""}`}
              aria-label="Workflow details"
            >
              <div className="dock-heading">
                <div role="tablist" aria-label="Workflow detail tabs">
                  <button
                    role="tab"
                    aria-selected={dockTab === "stage"}
                    onClick={() => {
                      setDockTab("stage");
                      setDockCollapsed(false);
                    }}
                  >
                    <Settings2 size={13} />
                    {edge ? routeLabel(edge, policy) : stage?.name || "Stage"}
                  </button>
                  <button
                    role="tab"
                    aria-selected={dockTab === "trace"}
                    onClick={() => {
                      setDockTab("trace");
                      setTraceOpen(true);
                      setDockCollapsed(false);
                    }}
                  >
                    <CircleDot size={13} />
                    Run trace
                    {run && (
                      <span className={`state-${run.outcome.toLowerCase()}`}>
                        {run.outcome}
                      </span>
                    )}
                  </button>
                </div>
                <button
                  aria-label={
                    dockCollapsed
                      ? "Expand workflow details"
                      : "Minimize workflow details"
                  }
                  onClick={() => setDockCollapsed(!dockCollapsed)}
                >
                  {dockCollapsed ? <ChevronDown size={14} /> : <X size={14} />}
                </button>
              </div>
              {!dockCollapsed && (
                <div className="dock-content">
                  {dockTab === "trace" ? (
                    <section
                      className={`run-panel ${traceOpen ? "expanded" : ""}`}
                    >
                      <div className="trace-toolbar">
                        <button
                          onClick={() => setTraceOpen(!traceOpen)}
                          aria-expanded={traceOpen}
                          aria-label={
                            traceOpen
                              ? "Minimize run trace"
                              : "Expand run trace"
                          }
                        >
                          {traceOpen ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                          <CircleDot size={14} />
                          <strong>Run trace</strong>
                          {run && (
                            <>
                              <span className={`outcome ${run.outcome}`}>
                                {run.outcome}
                              </span>
                              <span>{run.trace.length} stages</span>
                              {!fresh && (
                                <span className="stale-run">
                                  Changes since last run
                                </span>
                              )}
                            </>
                          )}
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openLeft("test")}
                        >
                          <Braces />
                          Test input
                        </Button>
                      </div>
                      {traceOpen &&
                        (run ? (
                          <div className="trace-area">
                            <div className="result-heading">
                              <span>
                                {fresh
                                  ? run.explanation
                                  : "Policy or input changed — run again for current results."}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!fresh}
                                onClick={() => ask("Explain this run")}
                              >
                                <Sparkles />
                                Explain
                              </Button>
                            </div>
                            {run.trace.map((entry, index) => (
                              <details key={entry.stageId} open>
                                <summary>
                                  <span className="trace-index">
                                    {index + 1}
                                  </span>
                                  <strong>{entry.name}</strong>
                                  <code>{entry.status}</code>
                                </summary>
                                <p>{entry.explanation}</p>
                                {entry.outputs && (
                                  <pre>{pretty(entry.outputs)}</pre>
                                )}
                                {entry.edges?.map((route) => (
                                  <button
                                    className="edge-trace"
                                    key={route.edgeId}
                                    onClick={() => selectEdge(route.edgeId)}
                                  >
                                    {route.matched ? (
                                      <Check size={12} />
                                    ) : (
                                      <span>–</span>
                                    )}
                                    <code>{route.condition || "true"}</code>
                                    <span>{String(route.matched)}</span>
                                  </button>
                                ))}
                              </details>
                            ))}
                          </div>
                        ) : (
                          <div className="empty">
                            <Play size={22} />
                            <p>Run a policy to inspect its trace.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openLeft("test")}
                            >
                              Open test input
                            </Button>
                          </div>
                        ))}
                    </section>
                  ) : (
                    <div className="sidebar-scroll inspector">
                      {edge ? (
                        <>
                          <div className="inspector-intro">
                            <span className="eyebrow">CONNECTION</span>
                            <h2>Next step</h2>
                            <p>
                              This connection always continues to the next
                              block. Use IF or Switch to choose between paths.
                            </p>
                          </div>
                          <div className="route-path">
                            <span>
                              {
                                policy.stages.find(
                                  (stage) => stage.id === edge.from,
                                )?.name
                              }
                            </span>
                            <ChevronRight size={13} />
                            <span>
                              {
                                policy.stages.find(
                                  (stage) => stage.id === edge.to,
                                )?.name
                              }
                            </span>
                          </div>
                          <label>
                            Next block
                            <select
                              aria-label="Connection destination"
                              value={edge.to}
                              onChange={(event) =>
                                editEdge({ to: event.target.value })
                              }
                            >
                              {policy.stages
                                .filter((stage) => stage.id !== edge.from)
                                .map((stage) => (
                                  <option key={stage.id} value={stage.id}>
                                    {stage.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              update({
                                ...policy,
                                edges: policy.edges.filter(
                                  (e) => e.id !== edge.id,
                                ),
                              });
                              setSelectedEdge("");
                            }}
                          >
                            <Trash2 />
                            Delete route
                          </Button>
                        </>
                      ) : stage ? (
                        <>
                          <div className="inspector-intro">
                            <span className="eyebrow">
                              {stage.kind === "decision"
                                ? "TERMINAL DECISION"
                                : stage.kind === "if"
                                  ? "IF CONDITION"
                                  : stage.kind === "switch"
                                    ? "SWITCH ROUTER"
                                    : "EVALUATION STAGE"}
                            </span>
                            <h2>{stage.name}</h2>
                            <p>
                              {stage.kind === "decision"
                                ? "Return a final policy outcome."
                                : stage.kind === "if"
                                  ? "Check a condition and follow True or False."
                                  : stage.kind === "switch"
                                    ? "Route the input through ordered cases, with an optional fallback."
                                    : "Transform evidence into typed, reusable outputs."}
                            </p>
                          </div>
                          <label>
                            Stage name
                            <input
                              value={stage.name}
                              onChange={(e) =>
                                editStage({ name: e.target.value })
                              }
                            />
                          </label>
                          <div className="two-fields">
                            <label>
                              Stage ID
                              <input value={stage.id} readOnly />
                            </label>
                            <label>
                              Type
                              <select
                                value={stage.kind}
                                disabled={isRouter(stage)}
                                onChange={(e) => {
                                  const kind = e.target.value as Stage["kind"];
                                  editStage(
                                    kind === "decision"
                                      ? {
                                          kind,
                                          outcome: "PASS",
                                          script: undefined,
                                          outputs: undefined,
                                          expressions: undefined,
                                        }
                                      : kind === "switch"
                                        ? {
                                            kind,
                                            script: undefined,
                                            outcome: undefined,
                                            expressions: undefined,
                                            outputs: undefined,
                                          }
                                        : kind === "javascript"
                                          ? {
                                              kind,
                                              outcome: undefined,
                                              expressions: undefined,
                                              outputs: {
                                                value: {
                                                  type: "number",
                                                  required: true,
                                                },
                                              },
                                              script:
                                                "return { value: Number(input.value ?? 0) };",
                                            }
                                          : {
                                              kind,
                                              script: undefined,
                                              outcome: undefined,
                                              outputs: {
                                                value: {
                                                  type: "boolean",
                                                  required: true,
                                                },
                                              },
                                              expressions: { value: "true" },
                                            },
                                  );
                                }}
                              >
                                <option value="transform">Evaluation</option>
                                <option value="switch" disabled>
                                  Switch
                                </option>
                                <option value="if" disabled>
                                  IF
                                </option>
                                <option value="javascript">Code</option>
                                <option value="decision">Decision</option>
                              </select>
                            </label>
                          </div>
                          {stage.kind === "decision" ? (
                            <label>
                              Terminal outcome
                              <select
                                value={stage.outcome}
                                onChange={(e) =>
                                  editStage({ outcome: e.target.value })
                                }
                              >
                                <option>PASS</option>
                                <option>REJECT</option>
                                <option>FLAG</option>
                                <option>UNKNOWN</option>
                              </select>
                            </label>
                          ) : stage.kind === "javascript" ? (
                            <JavaScriptEditor
                              key={stage.id}
                              stage={stage}
                              input={input}
                              stages={codeContext}
                              items={completions}
                              onChange={editStage}
                            />
                          ) : isRouter(stage) ? (
                            <SwitchCases
                              policy={policy}
                              stage={stage}
                              onChange={update}
                              input={input}
                            />
                          ) : (
                            <div className="stage-expressions">
                              <div className="tool-section-heading">
                                <span>OUTPUT EXPRESSIONS</span>
                                <button
                                  onClick={() => {
                                    let name = "output";
                                    let n = 1;
                                    while (
                                      Object.hasOwn(
                                        stage.expressions || {},
                                        name,
                                      )
                                    )
                                      name = "output" + n++;
                                    editStage({
                                      outputs: {
                                        ...stage.outputs,
                                        [name]: {
                                          type: "boolean",
                                          required: true,
                                        },
                                      },
                                      expressions: {
                                        ...stage.expressions,
                                        [name]: "true",
                                      },
                                    });
                                  }}
                                >
                                  <Plus size={12} />
                                  Add
                                </button>
                              </div>
                              {Object.entries(stage.expressions || {}).map(
                                ([name, expression]) => (
                                  <div className="output-expression" key={name}>
                                    <div className="output-heading">
                                      <code>{name}</code>
                                      <select
                                        aria-label={`${name} output type`}
                                        value={
                                          stage.outputs?.[name]?.type ||
                                          "boolean"
                                        }
                                        onChange={(e) =>
                                          editStage({
                                            outputs: {
                                              ...stage.outputs,
                                              [name]: {
                                                type: e.target
                                                  .value as Field["type"],
                                                required: true,
                                              },
                                            },
                                          })
                                        }
                                      >
                                        {[
                                          "boolean",
                                          "number",
                                          "string",
                                          "object",
                                          "array",
                                        ].map((type) => (
                                          <option key={type}>{type}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <ExpressionEditor
                                      label={`${name} expression`}
                                      value={expression}
                                      onChange={(value) =>
                                        editStage({
                                          expressions: {
                                            ...stage.expressions,
                                            [name]: value,
                                          },
                                        })
                                      }
                                      items={completions}
                                    />
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                          <label>
                            Explanation
                            <textarea
                              value={stage.explanation}
                              onChange={(e) =>
                                editStage({ explanation: e.target.value })
                              }
                            />
                          </label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              update({
                                ...policy,
                                stages: policy.stages.filter(
                                  (s) => s.id !== stage.id,
                                ),
                                edges: policy.edges.filter(
                                  (e) =>
                                    e.from !== stage.id && e.to !== stage.id,
                                ),
                              });
                              setSelected("");
                            }}
                          >
                            <Trash2 />
                            Remove stage
                          </Button>
                        </>
                      ) : (
                        <div className="inspector-empty">
                          <Settings2 size={25} />
                          <h3>Inspect a definition</h3>
                          <p>
                            Select a stage or click a branch condition on the
                            canvas.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </main>
          <aside
            className={`workspace-sidebar tools-sidebar ${rightCollapsed ? "collapsed" : ""}`}
            aria-label="Workspace tools"
          >
            <div className="tools-heading">
              {!rightCollapsed && (
                <div role="tablist" aria-label="Workspace tool tabs">
                  {(["assistant", "test", "policy", "blocks"] as const).map(
                    (tool) => (
                      <button
                        key={tool}
                        role="tab"
                        aria-selected={leftTab === tool}
                        onClick={() => setLeftTab(tool)}
                      >
                        {tool === "assistant"
                          ? "AI"
                          : tool === "test"
                            ? "Tests"
                            : tool === "policy"
                              ? "Interface"
                              : "Blocks"}
                      </button>
                    ),
                  )}
                </div>
              )}
              <button
                aria-label={
                  rightCollapsed
                    ? "Expand workspace tools"
                    : "Collapse workspace tools"
                }
                onClick={() => togglePanel("right")}
              >
                {rightCollapsed ? (
                  <PanelRightOpen size={15} />
                ) : (
                  <PanelRightClose size={15} />
                )}
              </button>
            </div>
            {rightCollapsed && (
              <div className="collapsed-actions">
                <button title="Open AI" onClick={() => openLeft("assistant")}>
                  <Sparkles size={16} />
                </button>
                <button title="Open tests" onClick={() => openLeft("test")}>
                  <Play size={16} />
                </button>
                <button
                  title="Open interface"
                  onClick={() => openLeft("policy")}
                >
                  <Braces size={16} />
                </button>
                <button title="Open blocks" onClick={() => openLeft("blocks")}>
                  <Layers size={16} />
                </button>
              </div>
            )}
            {!rightCollapsed && leftTab === "blocks" && (
              <BlockLibrary onAdd={addStage} />
            )}
            <div
              className="tool-tab-panel"
              hidden={rightCollapsed || leftTab !== "test"}
            >
              <div className="test-sidebar sidebar-scroll">
                <div className="tool-section-heading">
                  <span>TEST PAYLOAD</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInput(pretty(policy.exampleInput || {}));
                      setPayloadRevision((previous) => previous + 1);
                    }}
                  >
                    <RotateCcw />
                    Reset
                  </Button>
                </div>
                <p className="sidebar-copy">
                  This payload powers field suggestions in every expression
                  editor.
                </p>
                <PayloadEditor
                  key={`${workspace.activeDocumentId}:${payloadRevision}`}
                  value={input}
                  onChange={setInput}
                  onValidityChange={setInputFormValid}
                />
                <div
                  className={`payload-status ${payload.valid && inputFormValid ? "" : "invalid"}`}
                >
                  {payload.valid && inputFormValid ? (
                    <Check size={12} />
                  ) : (
                    <CircleDot size={12} />
                  )}{" "}
                  {payload.valid && inputFormValid
                    ? "Input ready · field suggestions are up to date"
                    : payload.valid
                      ? "Finish editing the highlighted field before running"
                      : "Invalid JSON · using declared schema for suggestions"}
                </div>
                <Button onClick={evaluate} disabled={busy || !inputFormValid}>
                  {busy ? <Loader2 className="spin" /> : <Play />}Evaluate input
                </Button>
                <SavedTests
                  key={workspace.activeDocumentId}
                  documentId={workspace.activeDocumentId}
                  policy={policy}
                  input={input}
                  onRecord={rememberRun}
                  inputValid={inputFormValid}
                  onLoad={(text) => {
                    setInput(text);
                    setPayloadRevision((previous) => previous + 1);
                  }}
                />
                <details className="test-discovered">
                  <summary>
                    Fields available for autocomplete · {payload.items.length}
                  </summary>
                  <div className="tool-section-heading">
                    <span>DISCOVERED FIELDS</span>
                    <span>{payload.items.length}</span>
                  </div>
                  <div className="field-explorer">
                    {payload.items.map((item) => (
                      <div key={item.path}>
                        <code>{item.path}</code>
                        <small>
                          {item.type} · {item.preview}
                        </small>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </div>
            {!rightCollapsed && leftTab === "policy" && (
              <div className="sidebar-scroll policy-tools interface-tools">
                <details className="interface-metadata">
                  <summary>Policy details</summary>
                  <div className="tool-section">
                    <div className="tool-section-heading">
                      <span>POLICY DETAILS</span>
                      <span className="tiny-badge">v{policy.version}</span>
                    </div>
                    <label>
                      Name
                      <input
                        value={policy.name}
                        onChange={(e) =>
                          update({ ...policy, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        value={policy.description}
                        onChange={(e) =>
                          update({ ...policy, description: e.target.value })
                        }
                      />
                    </label>
                    <div className="policy-identifier">
                      <span>ID</span>
                      <code>{policy.id}</code>
                    </div>
                  </div>
                </details>
                <div className="tool-section">
                  <div className="tool-section-heading">
                    <span>INPUT CONTRACT</span>
                    <button onClick={() => setTab("json")}>
                      Edit JSON <ArrowUpRight size={10} />
                    </button>
                  </div>
                  {Object.entries(policy.inputSchema).map(([name, field]) => (
                    <div className="schema-field" key={name}>
                      <code>{name}</code>
                      <select
                        aria-label={`${name} input type`}
                        value={field.type}
                        onChange={(e) =>
                          update({
                            ...policy,
                            inputSchema: {
                              ...policy.inputSchema,
                              [name]: {
                                ...field,
                                type: e.target.value as Field["type"],
                              },
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
                      <label title="Required">
                        <input
                          type="checkbox"
                          aria-label={`${name} required`}
                          checked={!!field.required}
                          onChange={(e) =>
                            update({
                              ...policy,
                              inputSchema: {
                                ...policy.inputSchema,
                                [name]: {
                                  ...field,
                                  required: e.target.checked,
                                },
                              },
                            })
                          }
                        />
                        Req
                      </label>
                      <button
                        aria-label={`Remove input ${name}`}
                        onClick={() => {
                          const schema = { ...policy.inputSchema };
                          delete schema[name];
                          update({ ...policy, inputSchema: schema });
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <form
                    className="add-field"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addInputField();
                    }}
                  >
                    <input
                      aria-label="New input field name"
                      placeholder="New field name"
                      value={newField}
                      onChange={(e) => setNewField(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      title="Add input field"
                      disabled={
                        !newField.trim() ||
                        Object.hasOwn(policy.inputSchema, newField.trim())
                      }
                    >
                      <Plus />
                    </Button>
                  </form>
                </div>

                <details className="interface-field-tree">
                  <summary>
                    Input data fields <small>from the test payload</small>
                  </summary>
                  {payload.items.map((item) => (
                    <div className="interface-output-row" key={item.path}>
                      <code>{item.path.replace(/^input\./, "")}</code>
                      <small>{item.type}</small>
                    </div>
                  ))}
                </details>
                <div className="tool-section">
                  <div className="tool-section-heading">
                    <span>OUTPUT</span>
                  </div>
                  <p className="sidebar-copy">
                    Every run returns an outcome, explanation, and stage trace.
                  </p>
                  <div className="interface-output-row">
                    <code>outcome</code>
                    <small>
                      PASS · REJECT · FLAG · UNKNOWN · EXECUTION_ERROR
                    </small>
                  </div>
                  <div className="interface-output-row">
                    <code>explanation</code>
                    <small>string</small>
                  </div>
                  <div className="interface-output-row">
                    <code>policyId</code>
                    <small>string</small>
                  </div>
                  <div className="interface-output-row">
                    <code>trace</code>
                    <small>array · stage outputs and evaluated routes</small>
                  </div>
                  {policy.stages
                    .filter((stage) => Object.keys(stage.outputs || {}).length)
                    .map((stage) => (
                      <details
                        className="interface-output-group"
                        key={stage.id}
                        open
                      >
                        <summary>
                          {stage.name}
                          <small>stage outputs</small>
                        </summary>
                        {Object.entries(stage.outputs || {}).map(
                          ([key, field]) => (
                            <div className="interface-output-row" key={key}>
                              <code>{key}</code>
                              <small>{field.type}</small>
                            </div>
                          ),
                        )}
                      </details>
                    ))}
                  {fresh && run && (
                    <details className="interface-last-result">
                      <summary>Latest result · {run.outcome}</summary>
                      <pre>{pretty(run)}</pre>
                    </details>
                  )}
                </div>
              </div>
            )}
            <div
              className="conversation-host"
              hidden={rightCollapsed || leftTab !== "assistant"}
            >
              <PolicyChat
                key={workspace.activeDocumentId}
                conversationKey={
                  "policy-studio-conversation-v1:" + workspace.activeDocumentId
                }
                policy={policy}
                mode={mode}
                input={input}
                visible={!rightCollapsed && leftTab === "assistant"}
                run={fresh ? run : null}
                records={records.filter((record) =>
                  record.documentId
                    ? record.documentId === workspace.activeDocumentId
                    : record.policy.id === policy.id,
                )}
                onRecord={rememberRun}
                request={chatRequest}
                onRequestHandled={() => setChatRequest(null)}
                onApply={applyChatPolicy}
              />
            </div>
          </aside>
        </div>
        <footer>
          <span>
            <ShieldCheck size={11} />
            Local runtime · Expr conditions
          </span>
          <span>Ctrl / ⌘ Space to autocomplete</span>
        </footer>
      </div>
    </div>
  );
}
