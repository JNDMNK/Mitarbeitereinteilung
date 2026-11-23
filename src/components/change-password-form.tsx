"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiClientError } from "@/lib/api-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";

export function ChangePasswordForm({ redirectAfter }: { redirectAfter?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== form.get("confirm")) {
      setError("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await api<{ redirectTo: string }>("/api/auth/password", {
        body: { currentPassword: form.get("currentPassword"), newPassword },
      });
      if (redirectAfter) {
        window.location.assign(res.redirectTo);
        return;
      }
      formEl.reset();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Ändern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">Das Passwort wurde geändert. Andere angemeldete Geräte wurden abgemeldet.</Alert>}
      <Field label="Aktuelles Passwort">
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Neues Passwort" hint={`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`}>
        <Input name="newPassword" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
      </Field>
      <Field label="Neues Passwort wiederholen">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Speichern …" : "Passwort ändern"}
      </Button>
    </form>
  );
}
