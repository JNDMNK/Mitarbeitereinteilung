import { apiRoute } from "@/server/api";
import { badRequest } from "@/server/errors";
import { importBackup, MAX_IMPORT_BYTES } from "@/server/services/backup";

export const runtime = "nodejs";

export const POST = apiRoute({ permission: "admin.backup" }, async ({ req, session }) => {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_IMPORT_BYTES + 1024 * 1024) throw badRequest("Die Datei ist zu groß (max. 50 MB).");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Ungültiger Upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Bitte eine Sicherungsdatei (.db) auswählen.");
  const result = await importBackup(session.user.id, new Uint8Array(await file.arrayBuffer()));
  return { ok: true, ...result };
});
