"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiClientError } from "@/lib/api-client";
import { COLOR_PRESETS } from "@/lib/masterdata-schemas";

export type Msg = { tone: "success" | "error"; text: string } | null;

export const errText = (err: unknown, fallback = "Aktion fehlgeschlagen.") =>
  err instanceof ApiClientError ? err.message : fallback;

/** Speichern + Meldung + Seite neu laden. Bei Konflikt (409) ebenfalls neu laden. */
export function useSave() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>, success: string): Promise<boolean> => {
      setBusy(true);
      setMsg(null);
      try {
        await fn();
        setMsg({ tone: "success", text: success });
        router.refresh();
        return true;
      } catch (err) {
        setMsg({ tone: "error", text: errText(err) });
        if (err instanceof ApiClientError && err.status === 409) router.refresh();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  return { msg, setMsg, busy, run };
}

/** Aktiv/Inaktiv umschalten über PATCH */
export function toggleActive(url: string, version: number, active: boolean) {
  return api(url, { method: "PATCH", body: { version, active } });
}

export function BackLink() {
  return (
    <div className="mb-2 text-sm">
      <Link href="/stammdaten" className="font-medium text-brand-700 hover:underline">
        ← Stammdaten
      </Link>
    </div>
  );
}

export function Toolbar({
  query,
  onQuery,
  placeholder,
  showInactive,
  onShowInactive,
  onCreate,
  createLabel,
  children,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  showInactive: boolean;
  onShowInactive: (v: boolean) => void;
  onCreate?: () => void;
  createLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 items-end gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-line md:flex md:flex-wrap md:p-4">
      <div className="col-span-2 md:min-w-48 md:flex-1">
        <Field label="Suche">
          <Input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} />
        </Field>
      </div>
      {children}
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-5 accent-brand-600" checked={showInactive} onChange={(e) => onShowInactive(e.target.checked)} />
        inaktive
        <span className="hidden md:inline">anzeigen</span>
      </label>
      {onCreate && (
        <Button onClick={onCreate} className="px-3">
          + <span className="md:hidden">Neu</span>
          <span className="hidden md:inline">{createLabel}</span>
        </Button>
      )}
    </div>
  );
}

export function MessageBar({ msg }: { msg: Msg }) {
  return msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null;
}

export function ListBox({ children, empty }: { children: ReactNode[]; empty: string }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line">
      {children.length === 0 ? <li className="p-6 text-center text-muted">{empty}</li> : children}
    </ul>
  );
}

export function Row({ inactive, children, actions }: { inactive?: boolean; children: ReactNode; actions: ReactNode }) {
  return (
    <li className={`flex flex-col gap-3 p-4 md:flex-row md:items-center ${inactive ? "bg-slate-50 text-muted" : ""}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex flex-wrap gap-2 [&>*]:flex-1 md:[&>*]:flex-none">{actions}</div>
    </li>
  );
}

export function Tag({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "brand" | "amber" | "green" | "red" }) {
  const cls = {
    slate: "bg-slate-200 text-slate-800",
    brand: "bg-brand-50 text-brand-800",
    amber: "bg-amber-100 text-amber-900",
    green: "bg-green-100 text-green-900",
    red: "bg-red-100 text-red-900",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${cls}`}>{children}</span>;
}

export function ColorDot({ color, size = "md" }: { color: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/10 ${size === "sm" ? "size-3" : "size-5"}`}
      style={{ backgroundColor: color }}
    />
  );
}

export function ColorField({ name, defaultValue, label = "Farbe" }: { name: string; defaultValue: string; label?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-semibold">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setValue(c)}
            aria-label={`Farbe ${c}`}
            aria-pressed={value === c}
            className={`size-9 rounded-full ring-offset-2 ${value === c ? "ring-3 ring-ink" : "ring-1 ring-black/10"}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <label className="flex items-center gap-2 text-sm text-muted">
          eigene:
          <input type="color" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line" />
        </label>
      </div>
    </fieldset>
  );
}

export function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? "Speichern …" : "Speichern"}
      </Button>
    </div>
  );
}

/** Text-Suche über mehrere Felder (Groß/klein egal) */
export function matches(query: string, ...fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

export const str = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
export const num = (f: FormData, key: string) => Number(f.get(key) ?? 0);

/** Hinweis bei inaktiven Einträgen: wann sie automatisch gelöscht werden */
export function AutoDeleteTag({ deactivatedAt, days }: { deactivatedAt: Date | string | null; days: number }) {
  if (!deactivatedAt || days <= 0) return null;
  const due = new Date(new Date(deactivatedAt).getTime() + days * 86400000);
  const text = due.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
  return <Tag tone="amber">wird am {text} automatisch gelöscht</Tag>;
}
