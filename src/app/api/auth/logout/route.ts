import { apiRoute } from "@/server/api";
import { destroyCurrentSession } from "@/server/auth/session";

export const POST = apiRoute({}, async () => {
  await destroyCurrentSession();
  return { ok: true };
});
