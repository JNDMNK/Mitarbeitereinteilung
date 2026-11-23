import { updateUserSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { updateUser } from "@/server/services/users";

export const PATCH = apiRoute<{ id: string }>({ permission: "admin.users" }, async ({ req, params, session }) => {
  const input = await parseJson(req, updateUserSchema);
  return { user: await updateUser(session.user.id, params.id, input) };
});
