"use client";
import { Braces, Code2, GitBranch, Plus, ShieldCheck } from "lucide-react";
import type { Stage } from "@/lib/types";

const blocks = [
  {
    kind: "if",
    name: "IF",
    icon: GitBranch,
    description: "Check one condition, then follow True or False.",
    color: "yellow",
  },
  {
    kind: "transform",
    name: "Evaluation",
    icon: Braces,
    description: "Compute typed values using expressions.",
    color: "blue",
  },
  {
    kind: "switch",
    name: "Switch",
    icon: GitBranch,
    description: "Choose a route from ordered conditions.",
    color: "yellow",
  },
  {
    kind: "javascript",
    name: "Code",
    icon: Code2,
    description: "Transform data with isolated JavaScript.",
    color: "purple",
  },
  {
    kind: "decision",
    name: "Decision",
    icon: ShieldCheck,
    description: "Finish with PASS, REJECT, FLAG, or UNKNOWN.",
    color: "green",
  },
] as const;

export function BlockLibrary({
  onAdd,
}: {
  onAdd: (kind: Stage["kind"]) => void;
}) {
  return (
    <div className="block-library sidebar-scroll">
      <div className="tool-section-heading">
        <span>BLOCKS</span>
        <span>{blocks.length}</span>
      </div>
      <p className="sidebar-copy">
        Click a block to add it to this workflow. Conditions belong to IF and
        Switch blocks.
      </p>
      <div className="block-library-list">
        {blocks.map(({ kind, name, icon: Icon, description, color }) => (
          <button
            key={kind}
            className="block-library-item"
            aria-label={`Add ${name} block`}
            onClick={() => onAdd(kind)}
          >
            <span className={`block-library-icon ${color}`}>
              <Icon size={17} />
            </span>
            <span className="block-library-copy">
              <strong>{name}</strong>
              <small>{description}</small>
            </span>
            <Plus size={14} />
          </button>
        ))}
      </div>
      <p className="block-library-note">
        Select a block on the canvas to edit it below. Connections link steps;
        case labels open their routing block.
      </p>
    </div>
  );
}
