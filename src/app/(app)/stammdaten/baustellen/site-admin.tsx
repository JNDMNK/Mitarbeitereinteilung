"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { api } from "@/lib/api-client";
import { SITE_STATUS_LABELS, SITE_STATUSES, type SiteStatus } from "@/lib/constants";
import { formatDate, mapsUrl, todayIso } from "@/lib/dates";
import { ColorDot, ColorField, FormActions, ListBox, matches, MessageBar, Row, str, Tag, toggleActive, Toolbar, useSave } from "@/components/masterdata/shared";

type Site = {
  id: string;
  name: string;
  address: string | null;
  customer: string | null;
  orderNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  note: string | null;
  color: string;
  active: boolean;
  adHoc: boolean;
  version: number;
};

const STATUS_TONE: Record<SiteStatus, "slate" | "green" | "amber"> = { PLANNED: "amber", ACTIVE: "green", DONE: "slate" };

export function SiteAdmin({ sites }: { sites: Site[] }) {
  const page = useSave();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | SiteStatus>("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [editing, setEditing] = useState<Site | "new" | null>(null);
  const today = todayIso();
  const adHocCount = sites.filter((s) => s.adHoc && s.active).length;

  const filtered = useMemo(
    () =>
      sites.filter(
        (s) =>
          (showInactive || s.active) &&
          (showAdHoc || !s.adHoc) &&
          (!status || s.status === status) &&
          matches(query, s.name, s.address, s.customer, s.orderNumber),
      ),
    [sites, query, status, showInactive, showAdHoc],
  );

  return (
    <div className="space-y-4">
      <MessageBar msg={page.msg} />
      <Toolbar
        query={query}
        onQuery={setQuery}
        placeholder="Name, Adresse, Kunde, Auftragsnr."
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        onCreate={() => setEditing("new")}
        createLabel="Baustelle anlegen"
      >
        <div className="min-w-0 md:w-44">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "" | SiteStatus)}>
              <option value="">alle</option>
              {SITE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SITE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-brand-600" checked={showAdHoc} onChange={(e) => setShowAdHoc(e.target.checked)} />
          freie Einträge ({adHocCount})
        </label>
      </Toolbar>

      <ListBox empty="Keine Baustellen gefunden.">
        {filtered.map((s) => {
          const ended = s.endDate && s.endDate < today && s.status !== "DONE";
          return (
            <Row
              key={s.id}
              inactive={!s.active}
              actions={
                <>
                  {s.adHoc && s.active && (
                    <Button
                      variant="secondary"
                      disabled={page.busy}
                      onClick={() =>
                        page.run(
                          () => api(`/api/sites/${s.id}`, { method: "PATCH", body: { version: s.version, adHoc: false } }),
                          `„${s.name}“ ist jetzt eine feste Baustelle.`,
                        )
                      }
                    >
                      Als feste Baustelle übernehmen
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setEditing(s)}>
                    Bearbeiten
                  </Button>
                  <Button
                    variant={s.active ? "ghost" : "secondary"}
                    disabled={page.busy}
                    onClick={() => page.run(() => toggleActive(`/api/sites/${s.id}`, s.version, !s.active), `"${s.name}" ${s.active ? "deaktiviert" : "aktiviert"}.`)}
                  >
                    {s.active ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <ColorDot color={s.color} />
                <span className="text-lg font-bold">{s.name}</span>
                <Tag tone={STATUS_TONE[s.status as SiteStatus] ?? "slate"}>{SITE_STATUS_LABELS[s.status as SiteStatus] ?? s.status}</Tag>
                {s.adHoc && <Tag>freier Eintrag</Tag>}
                {ended && <Tag tone="red">Zeitraum abgelaufen</Tag>}
                {!s.active && <Tag>inaktiv</Tag>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                {s.address && (
                  <a href={mapsUrl(s.address)} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                    📍 {s.address}
                  </a>
                )}
                {s.customer && <span>Kunde: {s.customer}</span>}
                {s.orderNumber && <span>Auftrag: {s.orderNumber}</span>}
                {(s.startDate || s.endDate) && (
                  <span>
                    {formatDate(s.startDate)} – {formatDate(s.endDate)}
                  </span>
                )}
              </div>
              {s.note && <div className="mt-0.5 text-sm italic text-muted">{s.note}</div>}
            </Row>
          );
        })}
      </ListBox>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Baustelle anlegen" : "Baustelle bearbeiten"}>
        {editing !== null && (
          <SiteForm
            key={editing === "new" ? "new" : editing.id}
            site={editing === "new" ? null : editing}
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

function SiteForm({ site, onDone, onCancel }: { site: Site | null; onDone: (msg: string) => void; onCancel: () => void }) {
  const form = useSave();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          name: str(f, "name"),
          address: str(f, "address") || null,
          customer: str(f, "customer") || null,
          orderNumber: str(f, "orderNumber") || null,
          startDate: str(f, "startDate") || null,
          endDate: str(f, "endDate") || null,
          status: str(f, "status"),
          note: str(f, "note") || null,
          color: str(f, "color"),
        };
        const ok = await form.run(
          () => (site ? api(`/api/sites/${site.id}`, { method: "PATCH", body: { ...body, version: site.version } }) : api("/api/sites", { body })),
          "",
        );
        if (ok) onDone(`Baustelle "${body.name}" gespeichert.`);
      }}
    >
      {form.msg?.tone === "error" && <MessageBar msg={form.msg} />}
      <Field label="Name">
        <Input name="name" defaultValue={site?.name} required maxLength={100} autoFocus />
      </Field>
      <Field label="Adresse" hint="Wird für den Navigationslink (Google Maps) verwendet.">
        <Input name="address" defaultValue={site?.address ?? ""} maxLength={200} placeholder="Straße Nr., PLZ Ort" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kunde (optional)">
          <Input name="customer" defaultValue={site?.customer ?? ""} maxLength={100} />
        </Field>
        <Field label="Auftragsnummer (optional)">
          <Input name="orderNumber" defaultValue={site?.orderNumber ?? ""} maxLength={50} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Zeitraum von">
          <Input name="startDate" type="date" defaultValue={site?.startDate ?? ""} />
        </Field>
        <Field label="bis">
          <Input name="endDate" type="date" defaultValue={site?.endDate ?? ""} />
        </Field>
      </div>
      <Field label="Status">
        <Select name="status" defaultValue={site?.status ?? "PLANNED"}>
          {SITE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SITE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <ColorField name="color" defaultValue={site?.color ?? "#2563eb"} />
      <Field label="Notiz (optional)">
        <textarea name="note" defaultValue={site?.note ?? ""} maxLength={1000} rows={3} className="block w-full rounded-lg border border-line px-3 py-2 text-base" />
      </Field>
      <FormActions busy={form.busy} onCancel={onCancel} />
    </form>
  );
}
