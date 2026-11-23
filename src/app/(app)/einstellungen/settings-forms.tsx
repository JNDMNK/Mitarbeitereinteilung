"use client";

/* eslint-disable @next/next/no-img-element -- Vorschau des hochgeladenen Logos */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { api, ApiClientError, apiUpload } from "@/lib/api-client";
import { formatMinutes, gridOptions } from "@/lib/time";

type Msg = { tone: "success" | "error"; text: string } | null;
const errText = (err: unknown, fallback: string) => (err instanceof ApiClientError ? err.message : fallback);

export function SettingsForm(props: { version: number; companyName: string; defaultStartMin: number; defaultEndMin: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const times = gridOptions(4 * 60, 22 * 60);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setMsg(null);
        try {
          await api("/api/settings", {
            method: "PATCH",
            body: {
              version: props.version,
              companyName: f.get("companyName"),
              defaultStartMin: Number(f.get("defaultStartMin")),
              defaultEndMin: Number(f.get("defaultEndMin")),
            },
          });
          setMsg({ tone: "success", text: "Einstellungen gespeichert." });
          router.refresh();
        } catch (err) {
          setMsg({ tone: "error", text: errText(err, "Speichern fehlgeschlagen.") });
        } finally {
          setBusy(false);
        }
      }}
    >
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Field label="Firmenname" hint="Erscheint in der Kopfzeile, auf der Anmeldeseite und im Ausdruck.">
        <Input name="companyName" defaultValue={props.companyName} required maxLength={80} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Standard-Arbeitsbeginn">
          <Select name="defaultStartMin" defaultValue={props.defaultStartMin}>
            {times.map((t) => (
              <option key={t} value={t}>
                {formatMinutes(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Standard-Arbeitsende">
          <Select name="defaultEndMin" defaultValue={props.defaultEndMin}>
            {times.map((t) => (
              <option key={t} value={t}>
                {formatMinutes(t)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-sm text-muted">Wird bei neuen Baustelleneinsätzen als Zeitfenster vorgeschlagen.</p>
      <Button type="submit" disabled={busy}>
        {busy ? "Speichern …" : "Speichern"}
      </Button>
    </form>
  );
}

export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > 1024 * 1024) {
      setMsg({ tone: "error", text: "Das Logo darf höchstens 1 MB groß sein." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append("logo", file);
    try {
      await apiUpload("/api/settings/logo", form);
      setMsg({ tone: "success", text: "Logo gespeichert." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "error", text: errText(err, "Hochladen fehlgeschlagen.") });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex min-h-32 items-center justify-center rounded-lg border-2 border-dashed border-line bg-slate-50 p-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Aktuelles Firmenlogo" className="max-h-28 max-w-full object-contain" />
        ) : (
          <span className="text-muted">Noch kein Logo hochgeladen</span>
        )}
      </div>
      <p className="text-sm text-muted">PNG, JPG oder WebP, höchstens 1 MB. Am besten quer und mit transparentem oder weißem Hintergrund.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        id="logo-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Hochladen …" : logoUrl ? "Logo ersetzen" : "Logo hochladen"}
        </Button>
        {logoUrl && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Logo wirklich entfernen?")) return;
              try {
                await api("/api/settings/logo", { method: "DELETE" });
                setMsg({ tone: "success", text: "Logo entfernt." });
                router.refresh();
              } catch (err) {
                setMsg({ tone: "error", text: errText(err, "Entfernen fehlgeschlagen.") });
              }
            }}
          >
            Logo entfernen
          </Button>
        )}
      </div>
    </div>
  );
}
