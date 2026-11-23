import { apiRoute } from "@/server/api";
import { unlockUser } from "@/server/services/users";

export const POST = apiRoute<{ id: string }>({ permission: "admin.users" }, async ({ params, session }) => {
  await unlockUser(session.user.id, params.id);
  return { ok: true };
});
