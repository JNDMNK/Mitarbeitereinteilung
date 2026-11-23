import { apiRoute } from "@/server/api";

export const GET = apiRoute({}, async ({ session }) => ({
  user: session.user,
  csrfToken: session.csrfToken,
}));
