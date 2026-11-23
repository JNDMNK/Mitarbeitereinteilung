import { apiRoute } from "@/server/api";
import { badRequest } from "@/server/errors";
import { LOGO_MAX_BYTES, logoUrl, removeLogo, saveLogo } from "@/server/services/settings";

export const POST = apiRoute({ permission: "admin.settings" }, async ({ req, session }) => {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > LOGO_MAX_BYTES + 64 * 1024) throw badRequest("Das Logo darf höchstens 1 MB groß sein.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Ungültiger Upload.");
  }
  const file = form.get("logo");
  if (!(file instanceof File)) throw badRequest("Bitte eine Bilddatei auswählen.");
  const saved = await saveLogo(session.user.id, new Uint8Array(await file.arrayBuffer()));
  return { logoUrl: logoUrl(saved) };
});

export const DELETE = apiRoute({ permission: "admin.settings" }, async ({ session }) => {
  await removeLogo(session.user.id);
  return { ok: true };
});
