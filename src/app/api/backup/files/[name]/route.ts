import { apiRoute } from "@/server/api";
import { notFound } from "@/server/errors";
import { backupFileStream } from "@/server/services/backup";

export const runtime = "nodejs";

export const GET = apiRoute<{ name: string }>({ permission: "admin.backup" }, async ({ params }) => {
  const file = await backupFileStream(params.name);
  if (!file) throw notFound("Sicherung nicht gefunden.");
  return new Response(file.stream, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="einteilung-${params.name}"`,
    },
  });
});
