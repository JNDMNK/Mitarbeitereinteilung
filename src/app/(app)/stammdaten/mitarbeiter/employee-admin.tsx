"use client";

import { useMemo, useState } from "react";
import { QualificationBadge } from "@/components/qualification-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { api } from "@/lib/api-client";
import { PASSWORD_MIN_LENGTH, QUALIFICATION_LABELS, QUALIFICATIONS, type Qualification } from "@/lib/constants";
import { formatDate, todayIso } from "@/lib/dates";
import { AutoDeleteTag, ColorDot, FormActions, ListBox, matches, MessageBar, Row, str, Tag, toggleActive, Toolbar, useSave } from "@/components/masterdata/shared";

type Employee = {
  id: string;
  deactivatedAt: Date | string | null;
  firstName: string;
  lastName: string;
  shortName: string;
  qualification: string;
  departmentId: string;
  phone: string | null;
  availableFrom: string | null;
  availableUntil: string | null;
  active: boolean;
  version: number;
  department: { id: string; name: string; color: string };
  user?: { id: string; username: string; active: boolean; role: string } | null;
};
type Department = { id: string; name: string; color: string; active: boolean };

export function EmployeeAdmin({
  employees,
  departments,
  takenUsernames,
  canDelete = false,
  autoDeleteDays = 0,
}: {
  employees: Employee[];
  departments: Department[];
  takenUsernames: string[];
  /** Endgültig löschen (nur Admin, nur inaktive) */
  canDelete?: boolean;
  autoDeleteDays?: number;
}) {
  const page = useSave();
  const [query, setQuery] = useState("");
  const [dep, setDep] = useState("");
  const [qual, setQual] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [loginFor, setLoginFor] = useState<Employee | null>(null);

  const filtered = useMemo(
    () =>
      employees.filter(
        (e) =>
          (showInactive || e.active) &&
          (!dep || e.departmentId === dep) &&
          (!qual || e.qualification === qual) &&
          matches(query, e.firstName, e.lastName, e.shortName, `${e.firstName} ${e.lastName}`, e.phone),
      ),
    [employees, query, dep, qual, showInactive],
  );

  return (
    <div className="space-y-4">
      <MessageBar msg={page.msg} />
      <Toolbar
        query={query}
        onQuery={setQuery}
        placeholder="Name, Kürzel oder Telefon"
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        onCreate={() => setEditing("new")}
        createLabel="Mitarbeiter anlegen"
      >
        <div className="min-w-0 md:w-44">
          <Field label="Abteilung">
            <Select value={dep} onChange={(e) => setDep(e.target.value)}>
              <option value="">alle</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-0 md:w-44">
          <Field label="Ausbildung">
            <Select value={qual} onChange={(e) => setQual(e.target.value)}>
              <option value="">alle</option>
              {QUALIFICATIONS.map((q) => (
                <option key={q} value={q}>
                  {QUALIFICATION_LABELS[q]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Toolbar>

      <p className="text-sm text-muted">
        {filtered.length} von {employees.filter((e) => e.active).length} aktiven Mitarbeitern
      </p>

      <ListBox empty="Keine Mitarbeiter gefunden.">
        {filtered.map((e) => (
          <Row
            key={e.id}
            inactive={!e.active}
            actions={
              <>
                {e.active && !e.user && (
                  <Button variant="secondary" onClick={() => setLoginFor(e)}>
                    Login anlegen
                  </Button>
                )}
                {e.active && e.user && !e.user.active && (
                  <Button variant="secondary" onClick={() => setLoginFor(e)}>
                    Login freischalten
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setEditing(e)}>
                  Bearbeiten
                </Button>
                <Button
                  variant={e.active ? "ghost" : "secondary"}
                  disabled={page.busy}
                  onClick={() => {
                    if (e.active && e.user?.active && !confirm(`${e.firstName} ${e.lastName} deaktivieren? Der Login "${e.user.username}" wird dabei ebenfalls gesperrt.`)) return;
                    void page.run(
                      () => toggleActive(`/api/employees/${e.id}`, e.version, !e.active),
                      `${e.firstName} ${e.lastName} ${e.active ? "deaktiviert" : "aktiviert"}.`,
                    );
                  }}
                >
                  {e.active ? "Deaktivieren" : "Aktivieren"}
                </Button>
                {canDelete && !e.active && (
                  <Button
                    variant="danger"
                    disabled={page.busy}
                    onClick={() => {
                      const name = `${e.firstName} ${e.lastName}`;
                      if (!confirm(`${name} endgültig löschen?\n\nAlle Einteilungen (auch vergangene Tage), Abwesenheiten, Standard-Zuordnungen${e.user ? ` und der Login "${e.user.username}"` : ""} werden gelöscht. Das kann nicht rückgängig gemacht werden.`)) return;
                      void page.run(() => api(`/api/employees/${e.id}`, { method: "DELETE", body: { version: e.version } }), `${name} wurde endgültig gelöscht.`);
                    }}
                  >
                    Endgültig löschen
                  </Button>
                )}
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: e.department.color }} aria-hidden />
              <span className="text-lg font-bold">
                {e.lastName}, {e.firstName}
              </span>
              <span className="font-mono text-sm font-semibold text-muted">{e.shortName}</span>
              <QualificationBadge q={e.qualification} />
              {(e.availableFrom || e.availableUntil) &&
                (e.availableUntil && e.availableUntil < todayIso() ? (
                  <Tag>{e.qualification === "PRAKTIKANT" ? "Praktikum" : "Zeitraum"} beendet</Tag>
                ) : (
                  <Tag tone="brand">
                    {e.qualification === "PRAKTIKANT" ? "Praktikum" : "im Betrieb"}{" "}
                    {e.availableFrom ? `${formatDate(e.availableFrom)} – ` : "bis "}
                    {e.availableUntil ? formatDate(e.availableUntil) : "offen"}
                  </Tag>
                ))}
              {!e.active && <Tag>inaktiv</Tag>}
                {!e.active && <AutoDeleteTag deactivatedAt={e.deactivatedAt} days={autoDeleteDays} />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <ColorDot color={e.department.color} size="sm" /> {e.department.name}
              </span>
              <span>{QUALIFICATION_LABELS[e.qualification as Qualification]}</span>
              {e.phone && (
                <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="text-brand-700 underline">
                  {e.phone}
                </a>
              )}
              <span>{e.user ? `Login: ${e.user.username}${e.user.active ? "" : " (gesperrt)"}` : "kein Login"}</span>
            </div>
          </Row>
        ))}
      </ListBox>

      <Dialog open={loginFor !== null} onClose={() => setLoginFor(null)} title={loginFor?.user ? "Login freischalten" : "Login anlegen"}>
        {loginFor && (
          <LoginForm
            key={loginFor.id}
            employee={loginFor}
            takenUsernames={takenUsernames}
            onDone={(text) => {
              setLoginFor(null);
              page.setMsg({ tone: "success", text });
            }}
            onCancel={() => setLoginFor(null)}
          />
        )}
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Mitarbeiter anlegen" : "Mitarbeiter bearbeiten"}>
        {editing !== null && (
          <EmployeeForm
            key={editing === "new" ? "new" : editing.id}
            employee={editing === "new" ? null : editing}
            departments={departments}
            takenUsernames={takenUsernames}
            onDone={(text) => {
              setEditing(null);
              page.setMsg({ tone: "success", text });
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

/** "Max", "Müller" -> "MMU" */
function suggestShortName(first: string, last: string) {
  const f = first.trim()[0] ?? "";
  const l = last.trim().slice(0, 2);
  return (f + l).toUpperCase();
}

/** "Max", "Müller" -> "max.mueller" */
function suggestUsername(first: string, last: string) {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]/g, "");
  return [norm(first), norm(last)].filter(Boolean).join(".");
}

function EmployeeForm({
  employee,
  departments,
  takenUsernames,
  onDone,
  onCancel,
}: {
  employee: Employee | null;
  departments: Department[];
  takenUsernames: string[];
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const form = useSave();
  const [first, setFirst] = useState(employee?.firstName ?? "");
  const [last, setLast] = useState(employee?.lastName ?? "");
  const [short, setShort] = useState(employee?.shortName ?? "");
  const [shortTouched, setShortTouched] = useState(!!employee);
  const [withLogin, setWithLogin] = useState(false);
  const [qualification, setQualification] = useState(employee?.qualification ?? "GESELLE");
  const [username, setUsername] = useState("");
  const [userTouched, setUserTouched] = useState(false);

  const effShort = shortTouched ? short : suggestShortName(first, last);
  const effUser = userTouched ? username : suggestUsername(first, last);
  const userTaken = withLogin && takenUsernames.includes(effUser);
  const activeDeps = departments.filter((d) => d.active || d.id === employee?.departmentId);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          firstName: first,
          lastName: last,
          shortName: effShort,
          qualification,
          departmentId: str(f, "departmentId"),
          phone: str(f, "phone") || null,
          availableFrom: str(f, "availableFrom") || null,
          availableUntil: str(f, "availableUntil") || null,
        };
        const ok = await form.run(
          () =>
            employee
              ? api(`/api/employees/${employee.id}`, { method: "PATCH", body: { ...body, version: employee.version } })
              : api("/api/employees", {
                  body: { ...body, login: withLogin ? { username: effUser, password: str(f, "password") } : null },
                }),
          "",
        );
        if (ok) onDone(`${first} ${last} gespeichert${withLogin ? ` – Login "${effUser}" angelegt` : ""}.`);
      }}
    >
      {form.msg?.tone === "error" && <MessageBar msg={form.msg} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vorname">
          <Input value={first} onChange={(e) => setFirst(e.target.value)} required maxLength={60} autoFocus />
        </Field>
        <Field label="Nachname">
          <Input value={last} onChange={(e) => setLast(e.target.value)} required maxLength={60} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kürzel" hint={shortTouched ? undefined : "Vorschlag – kann geändert werden"}>
          <Input
            value={effShort}
            onChange={(e) => {
              setShortTouched(true);
              setShort(e.target.value.toUpperCase());
            }}
            required
            maxLength={6}
            className="font-mono uppercase"
          />
        </Field>
        <Field label="Telefon (optional)">
          <Input name="phone" type="tel" defaultValue={employee?.phone ?? ""} maxLength={40} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ausbildungsstand">
          <Select name="qualification" value={qualification} onChange={(e) => setQualification(e.target.value)} required>
            {QUALIFICATIONS.map((q) => (
              <option key={q} value={q}>
                {QUALIFICATION_LABELS[q]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Abteilung">
          <Select name="departmentId" defaultValue={employee?.departmentId ?? activeDeps[0]?.id} required>
            {activeDeps.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className={`rounded-lg border p-3 ${qualification === "PRAKTIKANT" ? "border-sky-300 bg-sky-50" : "border-line"}`}>
        <legend className="px-1 text-sm font-semibold">{qualification === "PRAKTIKANT" ? "Praktikumszeitraum" : "Zeitraum im Betrieb (optional, z. B. befristet)"}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="von">
            <Input name="availableFrom" type="date" defaultValue={employee?.availableFrom ?? ""} />
          </Field>
          <Field label={qualification === "PRAKTIKANT" ? "bis (Pflicht)" : "bis"}>
            <Input name="availableUntil" type="date" defaultValue={employee?.availableUntil ?? ""} required={qualification === "PRAKTIKANT"} />
          </Field>
        </div>
        <p className="mt-1 text-xs text-muted">Außerhalb dieses Zeitraums erscheint die Person nicht in der Planung und kann nicht eingeteilt werden.</p>
      </fieldset>

      {!employee && (
        <div className="rounded-lg border border-line p-3">
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input type="checkbox" className="size-5 accent-brand-600" checked={withLogin} onChange={(e) => setWithLogin(e.target.checked)} />
            Login für diesen Mitarbeiter anlegen
          </label>
          {withLogin && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Benutzername" error={userTaken ? "Bereits vergeben" : undefined}>
                <Input
                  value={effUser}
                  onChange={(e) => {
                    setUserTouched(true);
                    setUsername(e.target.value.toLowerCase());
                  }}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label="Start-Passwort" hint={`Mind. ${PASSWORD_MIN_LENGTH} Zeichen.`}>
                <Input name="password" type="text" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
              </Field>
            </div>
          )}
        </div>
      )}
      {employee?.user && (
        <p className="text-sm text-muted">
          Verknüpfter Login: <strong>{employee.user.username}</strong>. Passwort und Rolle verwaltet der Admin unter Stammdaten → Benutzer.
        </p>
      )}
      <FormActions busy={form.busy || userTaken} onCancel={onCancel} />
    </form>
  );
}

/** Login für bestehenden Mitarbeiter anlegen bzw. gesperrten Login freischalten */
function LoginForm({
  employee,
  takenUsernames,
  onDone,
  onCancel,
}: {
  employee: Employee;
  takenUsernames: string[];
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const form = useSave();
  const existing = employee.user;
  const [username, setUsername] = useState(suggestUsername(employee.firstName, employee.lastName));
  const [password, setPassword] = useState("");
  const taken = !existing && takenUsernames.includes(username);
  return (
    <form
      className="space-y-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        let message = "";
        const ok = await form.run(async () => {
          const res = await api<{ message: string }>(`/api/employees/${employee.id}/login`, {
            body: existing ? { action: "activate", ...(password ? { password } : {}) } : { action: "create", username, password },
          });
          message = res.message;
        }, "");
        if (ok) onDone(message);
      }}
    >
      {form.msg?.tone === "error" && <MessageBar msg={form.msg} />}
      <p>
        <strong>
          {employee.firstName} {employee.lastName}
        </strong>{" "}
        {existing ? (
          <>
            hat den gesperrten Login <strong>{existing.username}</strong>.
          </>
        ) : (
          "bekommt einen Login mit der Rolle Mitarbeiter (nur lesen, „Meine Einteilung“)."
        )}
      </p>
      {!existing && (
        <Field label="Benutzername" error={taken ? "Bereits vergeben" : undefined}>
          <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required autoCapitalize="none" spellCheck={false} />
        </Field>
      )}
      <Field
        label={existing ? "Neues Start-Passwort (optional)" : "Start-Passwort"}
        hint={existing ? "Leer lassen, um das bisherige Passwort zu behalten." : `Mind. ${PASSWORD_MIN_LENGTH} Zeichen.`}
      >
        <Input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!existing}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
      </Field>
      <FormActions busy={form.busy || taken} onCancel={onCancel} />
    </form>
  );
}
