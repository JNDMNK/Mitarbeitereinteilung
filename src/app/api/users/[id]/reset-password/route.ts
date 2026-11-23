import { resetPasswordSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { adminResetPassword } from "@/server/services/users";

export const POST = apiRoute<{ id: string }>({ permission: "admin.users" }, async ({ req, params, session }) => {
  const input = await parseJson(req, resetPasswordSchema);
  await adminResetPassword(session.user.id, params.id, input.password);
  return { ok: true };
});
