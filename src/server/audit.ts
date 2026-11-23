import "server-only";
import type { DbOrTx } from "./db";

export type AuditEntry = {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  date?: string | null;
  summary: string;
  details?: unknown;
};

export async function audit(client: DbOrTx, entry: AuditEntry) {
  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      date: entry.date ?? null,
      summary: entry.summary.slice(0, 500),
      details: entry.details === undefined ? null : JSON.stringify(entry.details).slice(0, 20_000),
    },
  });
}
