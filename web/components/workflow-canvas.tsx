"use client";
import { useEffect, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  useNodesState,
  useUpdateNodeInternals,
  type OnConnectStart,
  type XYPosition,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Braces,
  Code2,
  ShieldCheck,
  Split,
  X,
  Plus,
} from "lucide-react";
import { OutcomeIcon } from "@/components/outcome-icon";
import { newBranchHandle, terminalOutcomes } from "@/lib/canvas-actions";
import { isRouter, resolvedRouting } from "@/lib/routing";
import { routeLabel } from "@/lib/rules";
import type { Policy, Run, Stage } from "@/lib/types";

type StageNode = Node<
  { stage: Stage; visited: boolean; active: boolean; status?: string },
  "stage"
>;
type ConditionEdge = Edge<
  {
    label: string;
    fallback: boolean;
    routing: boolean;
    active: boolean;
    onSelect: () => void;
  },
  "condition"
>;
function PolicyNode({ data }: NodeProps<StageNode>) {
  const stage = data.stage;
  const updateInternals = useUpdateNodeInternals();
  const cases = [...(stage.cases || [])].sort(
    (a, b) =>
      Number(!!a.default) - Number(!!b.default) ||
      (a.order || 0) - (b.order || 0) ||
      a.id.localeCompare(b.id),
  );
  const slots = cases.length + (stage.kind === "switch" ? 1 : 0);
  const handles = JSON.stringify([
    stage.kind,
    cases.map((item) => item.id),
    slots,
  ]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => updateInternals(stage.id));
    return () => cancelAnimationFrame(frame);
  }, [stage.id, handles, updateInternals]);
  return (
    <div
      className={`policy-node ${data.active ? "active" : ""} ${data.visited ? "visited" : ""}`}
      style={
        isRouter(stage)
          ? {
              minHeight: Math.max(44, slots * 10 + 4),
              display: "flex",
              alignItems: "center",
            }
          : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        aria-label={`Connect to ${stage.name}`}
      />
      <div
        className="node-title"
        title={`${stage.kind === "javascript" ? "Code" : stage.kind} · ${data.status || "Not run"}`}
      >
        <span
          className={`node-state state-${(stage.kind === "decision" ? stage.outcome : data.status)?.toLowerCase() || "idle"}`}
        >
          {stage.kind === "decision" ? (
            <OutcomeIcon outcome={stage.outcome} />
          ) : stage.kind === "javascript" ? (
            <Code2 size={15} />
          ) : isRouter(stage) ? (
            <Split size={15} />
          ) : (
            <Braces size={15} />
          )}
        </span>
        <strong>{stage.name}</strong>
        <span className="sr-only">{data.status || "Not run"}</span>
      </div>
      {isRouter(stage)
        ? cases.map((item, index) => (
            <Handle
              key={item.id}
              id={item.id}
              type="source"
              position={Position.Right}
              aria-label={`Connect ${item.label || "Case"} from ${stage.name}`}
              title={item.label || (item.default ? "Otherwise" : "Case")}
              style={{ top: `${7 + index * 10}px` }}
            />
          ))
        : stage.kind !== "decision" && (
            <Handle
              type="source"
              position={Position.Right}
              aria-label={`Connect from ${stage.name}`}
            />
          )}
      {stage.kind === "switch" && (
        <Handle
          id={newBranchHandle(stage)}
          type="source"
          position={Position.Right}
          className="branch-add-handle"
          aria-label={`Add branch from ${stage.name}`}
          title="Drag to add a branch without changing existing connections"
          style={{ top: `${7 + cases.length * 10}px` }}
        >
          <Plus size={9} />
        </Handle>
      )}
      {stage.kind === "if" && <span className="node-if-tag">IF</span>}
    </div>
  );
}
function BranchCondition(props: EdgeProps<ConditionEdge>) {
  const [path, x, y] = getBezierPath(props);
  const active = props.data?.active;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={24}
        style={{
          stroke: active ? "#171717" : props.animated ? "#737373" : "#c9c9c9",
          strokeWidth: active ? 1.8 : 1.2,
        }}
      />
      {(props.data?.routing || props.data?.label) && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label={`${props.data?.routing ? "Edit routing block for" : "Edit connection"} ${props.id}`}
            title={
              props.data?.routing
                ? "Edit cases in the routing block"
                : "Edit connection"
            }
            className={`branch-condition branch-title nodrag nopan ${active ? "selected" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              props.data?.onSelect();
            }}
          >
            <strong>{props.data?.label || "Unnamed route"}</strong>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { stage: PolicyNode };
const edgeTypes = { condition: BranchCondition };

export function WorkflowCanvas({
  policy,
  selectedStage,
  selectedEdge,
  run,
  fresh,
  onStage,
  onEdge,
  onConnect,
  onCreateConnected,
}: {
  policy: Policy;
  selectedStage: string;
  selectedEdge: string;
  run: Run | null;
  fresh: boolean;
  onStage: (id: string) => void;
  onEdge: (id: string) => void;
  onConnect: (connection: Connection) => void;
  onCreateConnected: (
    source: string,
    handle: string | null,
    kind: Stage["kind"],
    outcome?: string,
  ) => string | undefined;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const flow = useRef<ReactFlowInstance<StageNode, ConditionEdge> | null>(null);
  const [pending, setPending] = useState<{
    source: string;
    handle: string | null;
    left: number;
    top: number;
    point: XYPosition;
  } | null>(null);
  const origin = useRef<Parameters<OnConnectStart>[1] | null>(null),
    connected = useRef(false);
  const picker = useRef<HTMLDivElement>(null),
    spawnPositions = useRef(new Map<string, XYPosition>());
  useEffect(() => {
    if (!pending) return;
    picker.current
      ?.querySelector<HTMLButtonElement>("[role=menuitem]")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as HTMLElement))
        setPending(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [pending]);
  useEffect(() => {
    if (pending && !policy.stages.some((stage) => stage.id === pending.source))
      setPending(null);
  }, [policy, pending]);
  function create(kind: Stage["kind"], outcome?: string) {
    if (!pending) return;
    const id = onCreateConnected(pending.source, pending.handle, kind, outcome);
    if (id) spawnPositions.current.set(id, pending.point);
    setPending(null);
  }
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void flow.current?.fitView({ padding: 0.12, duration: 120 });
      });
    });
    if (surface.current) observer.observe(surface.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const depth: Record<string, number> = {};
  for (let n = 0; n < policy.stages.length; n++)
    for (const stage of policy.stages) {
      const parents = policy.edges.filter((e) => e.to === stage.id);
      depth[stage.id] = Math.min(
        policy.stages.length,
        parents.length
          ? Math.max(...parents.map((e) => (depth[e.from] ?? -1) + 1))
          : 0,
      );
    }
  const totals: Record<number, number> = {};
  for (const stage of policy.stages) {
    const d = depth[stage.id] || 0;
    totals[d] = (totals[d] || 0) + 1;
  }
  const widest = Math.max(1, ...Object.values(totals));
  const levelGap = Math.max(
    132,
    ...policy.stages
      .filter(isRouter)
      .map(
        (stage) =>
          ((stage.cases?.length || 0) + (stage.kind === "switch" ? 1 : 0)) *
            10 +
          44,
      ),
  );
  const levels: Record<number, number> = {};
  const visited = new Set(fresh ? run?.trace.map((t) => t.stageId) : []);
  const desired: StageNode[] = policy.stages.map((stage) => {
    const d = depth[stage.id] || 0;
    const index = levels[d] || 0;
    levels[d] = index + 1;
    return {
      id: stage.id,
      type: "stage",
      position: spawnPositions.current.get(stage.id) || {
        x: d * 420,
        y: (index + (widest - totals[d]) / 2) * levelGap,
      },
      data: {
        stage,
        active: selectedStage === stage.id,
        visited: visited.has(stage.id),
        status:
          fresh && visited.has(stage.id)
            ? run?.trace.find((t) => t.stageId === stage.id)?.status
            : undefined,
      },
    };
  });
  const topology =
    policy.stages
      .map((stage) => `${stage.id}:${stage.kind}:${stage.cases?.length || 0}`)
      .join("|") +
    policy.edges.map((edge) => `${edge.id}:${edge.from}>${edge.to}`).join("|");
  const layout = useRef(topology);
  const [nodes, setNodes, onNodesChange] = useNodesState<StageNode>(desired);
  useEffect(() => {
    const changed = layout.current !== topology;
    layout.current = topology;
    setNodes((existing) =>
      desired.map((node) => {
        const old = existing.find((n) => n.id === node.id);
        return {
          ...old,
          ...node,
          position: changed ? node.position : old?.position || node.position,
        };
      }),
    );
  }, [policy, topology, selectedStage, run, fresh, setNodes]); // Preserve canvas-only positions on policy edits.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void flow.current?.fitView({ padding: 0.12, duration: 120 });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [topology]);
  const edges: ConditionEdge[] = resolvedRouting(policy).edges.map((edge) => ({
    id: edge.id,
    type: "condition",
    source: edge.from,
    target: edge.to,
    sourceHandle: isRouter(
      policy.stages.find((stage) => stage.id === edge.from),
    )
      ? edge.id
      : undefined,
    animated:
      fresh &&
      !!run?.trace.some((t) =>
        t.edges?.some((e) => e.edgeId === edge.id && e.matched),
      ),
    data: {
      label: isRouter(policy.stages.find((stage) => stage.id === edge.from))
        ? routeLabel(edge, policy)
        : edge.label || "",
      routing: isRouter(policy.stages.find((stage) => stage.id === edge.from)),
      fallback: !!edge.default,
      active: selectedEdge === edge.id,
      onSelect: () => onEdge(edge.id),
    },
  }));
  return (
    <div ref={surface} className="workflow-surface">
      <ReactFlow
        onInit={(instance) => {
          flow.current = instance;
        }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onStage(node.id)}
        onEdgeClick={(_, edge) => onEdge(edge.id)}
        onConnectStart={(_, params) => {
          origin.current = params;
          connected.current = false;
          setPending(null);
        }}
        onConnect={(connection) => {
          connected.current = true;
          onConnect(connection);
        }}
        onConnectEnd={(event, state) => {
          const start = origin.current;
          origin.current = null;
          if (
            connected.current ||
            !start?.nodeId ||
            start.handleType !== "source"
          )
            return;
          const target = event.target instanceof Element ? event.target : null;
          const node = target?.closest<HTMLElement>(".react-flow__node");
          const existing = node?.dataset.id || state.toNode?.id;
          if (existing) {
            if (existing !== start.nodeId && state.toHandle?.type !== "source")
              onConnect({
                source: start.nodeId,
                sourceHandle: start.handleId || null,
                target: existing,
                targetHandle: null,
              });
            return;
          }
          if (
            !target?.closest(".react-flow__pane") ||
            !surface.current ||
            !flow.current
          )
            return;
          const pointer =
            "changedTouches" in event ? event.changedTouches[0] : event;
          if (!pointer) return;
          const rect = surface.current.getBoundingClientRect();
          setPending({
            source: start.nodeId,
            handle: start.handleId || null,
            left: Math.max(
              8,
              Math.min(pointer.clientX - rect.left, rect.width - 208),
            ),
            top: Math.max(
              8,
              Math.min(pointer.clientY - rect.top, rect.height - 340),
            ),
            point: flow.current.screenToFlowPosition({
              x: pointer.clientX,
              y: pointer.clientY,
            }),
          });
        }}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={1.5}
        deleteKeyCode={null}
      >
        <Background gap={20} size={1} color="#dedede" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {pending && (
        <div
          ref={picker}
          className="connection-block-picker"
          role="menu"
          aria-label="Choose connected block"
          style={{ left: pending.left, top: pending.top }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setPending(null);
            }
            if (event.key === "Tab") setPending(null);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role=menuitem]",
                ),
              );
              const current = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              buttons[
                (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                  buttons.length
              ]?.focus();
            }
          }}
        >
          <div className="connection-picker-heading">
            <span>Choose next block</span>
            <button
              aria-label="Cancel new block"
              onClick={() => setPending(null)}
            >
              <X size={12} />
            </button>
          </div>
          {(
            [
              ["transform", "Evaluation", Braces],
              ["if", "IF", Split],
              ["switch", "Switch", Split],
              ["javascript", "Code", Code2],
            ] as const
          ).map(([kind, name, Icon]) => (
            <button key={kind} role="menuitem" onClick={() => create(kind)}>
              <Icon size={14} />
              {name}
            </button>
          ))}
          <div className="connection-picker-section">DECISION</div>
          {terminalOutcomes.map((outcome) => (
            <button
              role="menuitem"
              key={outcome}
              onClick={() => create("decision", outcome)}
            >
              <span className={`state-${outcome.toLowerCase()}`}>
                <OutcomeIcon outcome={outcome} size={14} />
              </span>
              {outcome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
