import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-slate-400",
  secondary: "bg-white text-ink border border-line hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-slate-400",
  ghost: "bg-transparent text-ink hover:bg-slate-200/70 active:bg-slate-200 disabled:text-slate-400",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
