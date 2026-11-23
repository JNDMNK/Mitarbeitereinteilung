import { NextResponse, type NextRequest } from "next/server";

// Setzt Security-Header (inkl. CSP mit Nonce) und leitet Seitenaufrufe ohne
// Sitzungs-Cookie auf /login. Die eigentliche Sitzungsprüfung erfolgt
// serverseitig in Layout/Seiten und in jeder API-Route.

const PUBLIC_PAGES = ["/login"];
const SESSION_COOKIES = ["__Host-einteilung", "einteilung_session"];

function isSecure(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline-Style-Attribute werden von React/dnd-kit (transform) benötigt
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isSecure() ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, csp?: string) {
  if (csp) res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const res = NextResponse.next();
    // Logo setzt eigene Cache-Header (versionierte URL)
    if (pathname !== "/api/logo") res.headers.set("Cache-Control", "no-store");
    return applySecurityHeaders(res);
  }

  const hasSession = SESSION_COOKIES.some((n) => request.cookies.has(n));
  const isPublic = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Cache-Control", "private, no-store");
  return applySecurityHeaders(res, csp);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.png|robots.txt|icons/|manifest.webmanifest|sw.js).*)",
    },
  ],
};
