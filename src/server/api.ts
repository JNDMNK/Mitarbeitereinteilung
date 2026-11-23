import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { can, type Permission } from "@/lib/roles";
import { Prisma } from "@/generated/prisma/client";
import { getSession, refreshSessionCookie, safeEqual, type CurrentSession } from "./auth/session";
import { checkCsrfToken, checkOrigin } from "./csrf";
import { env } from "./env";
import { ApiError, badRequest, forbidden, unauthorized } from "./errors";

type RouteContext<P> = { params: Promise<P> };

export type HandlerCtx<P> = {
  req: Request;
  params: P;
  session: CurrentSession;
};

type Options = {
  /** Erforderliches Recht; ohne Angabe genügt ein gültiger Login */
  permission?: Permission;
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Einheitlicher Rahmen für alle API-Routen:
 * Login -> Recht -> CSRF (bei Änderungen) -> Handler -> Fehlerabbildung.
 */
export function apiRoute<P = Record<string, never>>(
  options: Options,
  handler: (ctx: HandlerCtx<P>) => Promise<unknown>,
) {
  return async (req: Request, context: RouteContext<P>): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) throw unauthorized();
      if (session.user.mustChangePassword && !isPasswordChange(req)) {
        throw new ApiError(403, "Bitte zuerst das Passwort ändern.", "password_change_required");
      }
      if (options.permission && !can(session.user.role, options.permission)) throw forbidden();
      if (MUTATING.has(req.method)) {
        const h = await headers();
        checkOrigin(h, env().appOrigin);
        checkCsrfToken(h, session.csrfToken, safeEqual);
      }
      const params = (await context.params) ?? ({} as P);
      const result = await handler({ req, params, session });
      await refreshSessionCookie(session);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function isPasswordChange(req: Request): boolean {
  const path = new URL(req.url).pathname;
  return path === "/api/auth/password" || path === "/api/auth/logout" || path === "/api/auth/me";
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code, details: err.details },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      {
        error: first?.message ?? "Ungültige Eingabe.",
        code: "validation",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Dieser Wert ist bereits vergeben.", code: "unique" }, { status: 409 });
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Datensatz nicht gefunden.", code: "not_found" }, { status: 404 });
    }
  }
  console.error("[api] Unerwarteter Fehler:", err);
  return NextResponse.json({ error: "Interner Fehler. Bitte erneut versuchen.", code: "internal" }, { status: 500 });
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Ungültiger Anfrageinhalt.");
  }
  return schema.parse(body);
}
