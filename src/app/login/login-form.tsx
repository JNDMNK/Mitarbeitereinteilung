"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiClientError } from "@/lib/api-client";

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ redirectTo: string }>("/api/auth/login", {
        body: { username: form.get("username"), password: form.get("password") },
      });
      const target = res.redirectTo === "/passwort-aendern" ? res.redirectTo : (next ?? res.redirectTo);
      window.location.assign(target);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Anmeldung fehlgeschlagen.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Benutzername">
        <Input name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
      </Field>
      <Field label="Passwort">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Anmelden …" : "Anmelden"}
      </Button>
    </form>
  );
}
