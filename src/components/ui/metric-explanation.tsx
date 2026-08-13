import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

export function MetricExplanation({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5"
      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
    >
      <CircleHelp
        aria-hidden="true"
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        style={{ color: "var(--color-primary)" }}
      />
      <p>{children}</p>
    </div>
  );
}
