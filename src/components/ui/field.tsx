import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-sm text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-sm font-medium text-red-700">{error}</span>}
    </label>
  );
}

const inputCls =
  "block w-full min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-slate-400 focus:border-brand-600 disabled:bg-slate-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}
