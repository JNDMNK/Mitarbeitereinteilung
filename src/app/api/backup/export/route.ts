import { apiRoute } from "@/server/api";
import { notFound } from "@/server/errors";
import { backupFileStream, exportBackup } from "@/server/services/backup";

export const runtime = "nodejs";

export const GET = apiRoute({ permission: "admin.backup" }, async ({ session }) => {
  const name = await exportBackup(session.user.id);
  const file = await backupFileStream(name);
  if (!file) throw notFound("Sicherung konnte nicht erstellt werden.");
  return new Response(file.stream, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="einteilung-${name.replace(/^manuell-/, "")}"`,
    },
  });
});
