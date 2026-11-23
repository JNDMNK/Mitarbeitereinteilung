"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/lib/api-client";
import {
  ColorDot,
  ColorField,
  FormActions,
  ListBox,
  matches,
  MessageBar,
  num,
  Row,
  str,
  Tag,
  toggleActive,
  Toolbar,
  useSave,
} from "./shared";

export type ColorEntity = {
  id: string;
  name: string;
  code?: string;
  color: string;
  sortOrder: number;
  active: boolean;
  version: number;
  /** z. B. Anzahl aktiver Mitarbeiter */
  info?: string;
};

/** Verwaltung für Abteilungen und Abwesenheitsarten (Name, optional Kürzel, Farbe, Reihenfolge) */
export function ColorEntityAdmin({
  items,
  endpoint,
  singular,
  withCode,
}: {
  items: ColorEntity[];
  endpoint: string;
  singular: string;
  withCode?: boolean;
}) {
  const page = useSave();
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ColorEntity | "new" | null>(null);

  const filtered = useMemo(
    () => items.filter((i) => (showInactive || i.active) && matches(query, i.name, i.code)),
    [items, query, showInactive],
  );

  return (
    <div className="space-y-4">
      <MessageBar msg={page.msg} />
      <Toolbar
        query={query}
        onQuery={setQuery}
        placeholder={withCode ? "Name oder Kürzel" : "Name"}
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        onCreate={() => setEditing("new")}
        createLabel={`${singular} anlegen`}
      />
      <ListBox empty="Keine Einträge gefunden.">
        {filtered.map((i) => (
          <Row
            key={i.id}
            inactive={!i.active}
            actions={
              <>
                <Button variant="secondary" onClick={() => setEditing(i)}>
                  Bearbeiten
                </Button>
                <Button
                  variant={i.active ? "ghost" : "secondary"}
                  disabled={page.busy}
                  onClick={() =>
                    page.run(
                      () => toggleActive(`${endpoint}/${i.id}`, i.version, !i.active),
                      `"${i.name}" ${i.active ? "deaktiviert" : "aktiviert"}.`,
                    )
                  }
                >
                  {i.active ? "Deaktivieren" : "Aktivieren"}
                </Button>
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <ColorDot color={i.color} />
              {withCode && (
                <span className="rounded px-2 py-0.5 font-mono text-sm font-bold text-white" style={{ backgroundColor: i.color }}>
                  {i.code}
                </span>
              )}
              <span className="text-lg font-bold">{i.name}</span>
              {!i.active && <Tag>inaktiv</Tag>}
            </div>
            {i.info && <div className="text-sm text-muted">{i.info}</div>}
          </Row>
        ))}
      </ListBox>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? `${singular} anlegen` : `${singular} bearbeiten`}>
        {editing !== null && (
          <EntityForm
            key={editing === "new" ? "new" : editing.id}
            item={editing === "new" ? null : editing}
            endpoint={endpoint}
            withCode={withCode}
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

function EntityForm({
  item,
  endpoint,
  withCode,
  onDone,
  onCancel,
}: {
  item: ColorEntity | null;
  endpoint: string;
  withCode?: boolean;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const form = useSave();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          name: str(f, "name"),
          ...(withCode ? { code: str(f, "code") } : {}),
          color: str(f, "color"),
          sortOrder: num(f, "sortOrder"),
        };
        const ok = await form.run(
          () => (item ? api(`${endpoint}/${item.id}`, { method: "PATCH", body: { ...body, version: item.version } }) : api(endpoint, { body })),
          "",
        );
        if (ok) onDone(`"${body.name}" gespeichert.`);
      }}
    >
      {form.msg?.tone === "error" && <MessageBar msg={form.msg} />}
      <Field label="Name">
        <Input name="name" defaultValue={item?.name} required maxLength={60} autoFocus />
      </Field>
      {withCode && (
        <Field label="Kürzel" hint="1–4 Zeichen, z. B. U, K, BS">
          <Input name="code" defaultValue={item?.code} required maxLength={4} className="uppercase" />
        </Field>
      )}
      <ColorField name="color" defaultValue={item?.color ?? "#64748b"} />
      <Field label="Reihenfolge" hint="Kleinere Zahlen stehen weiter oben.">
        <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={item?.sortOrder ?? 0} />
      </Field>
      <FormActions busy={form.busy} onCancel={onCancel} />
    </form>
  );
}
