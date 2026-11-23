"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { api, ApiClientError } from "@/lib/api-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles";

type UserRow = {
  id: string;
  username: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  version: number;
  employeeId: string | null;
  employee: { firstName: string; lastName: string; shortName: string } | null;
};
type EmployeeOption = { id: string; label: string; linkedUserId: string | null };

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; user: UserRow }
  | { kind: "reset"; user: UserRow }
  | null;

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

export function UserAdmin({ users, employees, currentUserId }: { users: UserRow[]; employees: EmployeeOption[]; currentUserId: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [showInactive, setShowInactive] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (!showInactive && !u.active) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      const emp = u.employee ? `${u.employee.firstName} ${u.employee.lastName} ${u.employee.shortName}` : "";
      return `${u.username} ${emp}`.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter, showInactive]);

  function done(text: string) {
    setDialog(null);
    setMessage({ tone: "success", text });
    router.refresh();
  }

  async function quick(action: () => Promise<unknown>, text: string) {
    try {
      await action();
      done(text);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiClientError ? err.message : "Aktion fehlgeschlagen." });
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-line">
        <div className="min-w-48 flex-1">
          <Field label="Suche">
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Benutzername oder Name" />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Rolle">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | Role)}>
              <option value="">alle</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-brand-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          inaktive anzeigen
        </label>
        <Button onClick={() => setDialog({ kind: "create" })}>+ Benutzer anlegen</Button>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line">
        {filtered.length === 0 && <li className="p-6 text-center text-muted">Keine Benutzer gefunden.</li>}
        {filtered.map((u) => (
          <li key={u.id} className={`flex flex-wrap items-center gap-3 p-4 ${u.active ? "" : "bg-slate-50 text-muted"}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">{u.username}</span>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-sm font-semibold text-brand-800">{ROLE_LABELS[u.role as Role] ?? u.role}</span>
                {!u.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-sm font-semibold">inaktiv</span>}
                {u.lockedUntil && <span className="rounded-full bg-red-100 px-2 py-0.5 text-sm font-semibold text-red-800">gesperrt</span>}
                {u.mustChangePassword && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900">Passwortwechsel offen</span>}
              </div>
              <div className="text-sm text-muted">
                {u.employee ? `${u.employee.firstName} ${u.employee.lastName} (${u.employee.shortName})` : "kein Mitarbeiter verknüpft"}
                {" · "}
                {u.lastLoginAt ? `letzter Login ${dateFmt.format(new Date(u.lastLoginAt))}` : "noch nie angemeldet"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {u.lockedUntil && (
                <Button variant="secondary" onClick={() => quick(() => api(`/api/users/${u.id}/unlock`, { method: "POST" }), `Sperre von "${u.username}" aufgehoben.`)}>
                  Entsperren
                </Button>
              )}
              <Button variant="secondary" onClick={() => setDialog({ kind: "reset", user: u })}>
                Passwort zurücksetzen
              </Button>
              <Button variant="secondary" onClick={() => setDialog({ kind: "edit", user: u })}>
                Bearbeiten
              </Button>
              {u.id !== currentUserId && (
                <Button
                  variant={u.active ? "ghost" : "secondary"}
                  onClick={() =>
                    quick(
                      () => api(`/api/users/${u.id}`, { method: "PATCH", body: { version: u.version, active: !u.active } }),
                      u.active ? `"${u.username}" deaktiviert.` : `"${u.username}" aktiviert.`,
                    )
                  }
                >
                  {u.active ? "Deaktivieren" : "Aktivieren"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={dialog?.kind === "create" || dialog?.kind === "edit"} onClose={() => setDialog(null)} title={dialog?.kind === "edit" ? "Benutzer bearbeiten" : "Benutzer anlegen"}>
        {(dialog?.kind === "create" || dialog?.kind === "edit") && (
          <UserForm
            key={dialog.kind === "edit" ? dialog.user.id : "new"}
            user={dialog.kind === "edit" ? dialog.user : null}
            employees={employees}
            isSelf={dialog.kind === "edit" && dialog.user.id === currentUserId}
            onDone={done}
          />
        )}
      </Dialog>

      <Dialog open={dialog?.kind === "reset"} onClose={() => setDialog(null)} title="Passwort zurücksetzen">
        {dialog?.kind === "reset" && <ResetForm user={dialog.user} onDone={done} />}
      </Dialog>
    </div>
  );
}

function UserForm({
  user,
  employees,
  isSelf,
  onDone,
}: {
  user: UserRow | null;
  employees: EmployeeOption[];
  isSelf: boolean;
  onDone: (msg: string) => void;
}) {
  const [role, setRole] = useState<Role>((user?.role as Role) ?? "EMPLOYEE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = employees.filter((e) => !e.linkedUserId || e.linkedUserId === user?.id);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const employeeId = (f.get("employeeId") as string) || null;
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await api(`/api/users/${user.id}`, {
          method: "PATCH",
          body: { version: user.version, username: f.get("username"), role, employeeId },
        });
        onDone(`Benutzer "${f.get("username")}" gespeichert.`);
      } else {
        await api("/api/users", {
          body: {
            username: f.get("username"),
            password: f.get("password"),
            role,
            employeeId,
            mustChangePassword: f.get("mustChangePassword") === "on",
          },
        });
        onDone(`Benutzer "${f.get("username")}" angelegt.`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Speichern fehlgeschlagen.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Benutzername" hint="Kleinbuchstaben, Ziffern, . _ -">
        <Input name="username" defaultValue={user?.username} required autoCapitalize="none" autoComplete="off" spellCheck={false} />
      </Field>
      {!user && (
        <Field label="Start-Passwort" hint={`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`}>
          <Input name="password" type="text" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
        </Field>
      )}
      <Field label="Rolle" hint={isSelf ? "Die eigene Rolle kann nicht geändert werden." : undefined}>
        <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={role === "EMPLOYEE" ? "Mitarbeiter (Pflicht)" : "Mitarbeiter (optional)"}
        hint={available.length === 0 ? "Es gibt noch keine freien Mitarbeiter-Datensätze." : undefined}
      >
        <Select name="employeeId" defaultValue={user?.employeeId ?? ""} required={role === "EMPLOYEE"}>
          <option value="">– keiner –</option>
          {available.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
      </Field>
      {!user && (
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="mustChangePassword" defaultChecked className="size-5 accent-brand-600" />
          Passwort beim ersten Login ändern
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Speichern …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}

function ResetForm({ user, onDone }: { user: UserRow; onDone: (msg: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          await api(`/api/users/${user.id}/reset-password`, { body: { password: f.get("password") } });
          onDone(`Passwort von "${user.username}" zurückgesetzt. Beim nächsten Login muss ein neues vergeben werden.`);
        } catch (err) {
          setError(err instanceof ApiClientError ? err.message : "Zurücksetzen fehlgeschlagen.");
          setBusy(false);
        }
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <p>
        Neues vorläufiges Passwort für <strong>{user.username}</strong>. Alle Sitzungen des Benutzers werden beendet.
      </p>
      <Field label="Vorläufiges Passwort" hint={`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`}>
        <Input name="password" type="text" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Speichern …" : "Zurücksetzen"}
        </Button>
      </div>
    </form>
  );
}
