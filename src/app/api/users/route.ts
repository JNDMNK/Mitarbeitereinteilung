import { createUserSchema } from "@/lib/validation";
import { apiRoute, parseJson } from "@/server/api";
import { createUser, listUsers } from "@/server/services/users";

export const GET = apiRoute({ permission: "admin.users" }, async () => ({ users: await listUsers() }));

export const POST = apiRoute({ permission: "admin.users" }, async ({ req, session }) => {
  const input = await parseJson(req, createUserSchema);
  return { user: await createUser(session.user.id, input) };
});
