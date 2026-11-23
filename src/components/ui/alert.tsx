import type { ReactNode } from "react";

const TONES = {
  error: "border-red-300 bg-red-50 text-red-900",
  success: "border-green-300 bg-green-50 text-green-900",
  info: "border-brand-100 bg-brand-50 text-brand-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
};

export function Alert({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-base ${TONES[tone]}`}>
      {children}
    </div>
  );
}
