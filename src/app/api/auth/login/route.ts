import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { errorResponse, parseJson } from "@/server/api";
import { login } from "@/server/auth/login";
import { checkOrigin } from "@/server/csrf";
import { env } from "@/server/env";
import { clientIp } from "@/server/request";

export async function POST(req: Request) {
  try {
    const h = await headers();
    // Vor dem Login gibt es noch kein Sitzungs-Token -> Origin-Prüfung
    checkOrigin(h, env().appOrigin);
    const input = await parseJson(req, loginSchema);
    const result = await login({
      ...input,
      ip: clientIp(h, env().trustProxyHops),
      userAgent: h.get("user-agent") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
