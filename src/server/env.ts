import "server-only";

function read(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

const isProd = process.env.NODE_ENV === "production";

function sessionSecret(): string {
  const s = read("SESSION_SECRET");
  if (s && s.length >= 32) return s;
  if (isProd) {
    throw new Error("SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen.");
  }
  return "dev-only-insecure-session-secret-0123456789";
}

function appUrl(): URL {
  const raw = read("APP_URL") ?? `http://localhost:${read("PORT") ?? "3000"}`;
  try {
    return new URL(raw);
  } catch {
    throw new Error(`APP_URL ist keine gültige URL: ${raw}`);
  }
}

let cached: ReturnType<typeof build> | undefined;

function build() {
  const url = appUrl();
  return {
    isProd,
    databaseUrl: read("DATABASE_URL") ?? "file:./data/dev.db",
    sessionSecret: sessionSecret(),
    appUrl: url,
    appOrigin: url.origin,
    /** Cookies nur über HTTPS, sobald die App unter https:// erreichbar ist */
    secureCookies: url.protocol === "https:",
    /** Anzahl vertrauenswürdiger Proxy-Hops vor der App (0 = X-Forwarded-* ignorieren) */
    trustProxyHops: Math.max(0, Number.parseInt(read("TRUST_PROXY") ?? "0", 10) || 0),
    initialAdminUser: read("INITIAL_ADMIN_USER"),
    initialAdminPassword: read("INITIAL_ADMIN_PASSWORD"),
    dataDir: read("DATA_DIR") ?? (isProd ? "/data" : "./data"),
  };
}

export function env() {
  cached ??= build();
  return cached;
}
