import { homePathFor } from "@/lib/roles";
import { changePasswordSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { changeOwnPassword } from "@/server/services/users";

export const POST = apiRoute({}, async ({ req, session }) => {
  const input = await parseJson(req, changePasswordSchema);
  await changeOwnPassword(session.user.id, session.sessionId, input.currentPassword, input.newPassword);
  return { ok: true, redirectTo: homePathFor(session.user.role) };
});
