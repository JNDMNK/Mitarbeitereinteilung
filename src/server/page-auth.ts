import "server-only";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/lib/roles";
import { getSession, type CurrentSession } from "./auth/session";

/** Für Server-Komponenten: Login erzwingen (sonst -> /login) */
export async function requirePageSession(): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/passwort-aendern");
  return session;
}

/** Für Server-Komponenten: Recht erzwingen (sonst -> Startseite) */
export async function requirePagePermission(permission: Permission): Promise<CurrentSession> {
  const session = await requirePageSession();
  if (!can(session.user.role, permission)) redirect("/");
  return session;
}
