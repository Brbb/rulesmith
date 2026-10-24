import { CircleHelp, CircleX, Flag, ShieldCheck, TriangleAlert } from "lucide-react";

export function OutcomeIcon({ outcome, size = 15 }: { outcome?: string; size?: number }) {
  switch (outcome) {
    case "REJECT": return <CircleX size={size} />;
    case "FLAG": return <Flag size={size} />;
    case "UNKNOWN": return <CircleHelp size={size} />;
    case "EXECUTION_ERROR": return <TriangleAlert size={size} />;
    default: return <ShieldCheck size={size} />;
  }
}
