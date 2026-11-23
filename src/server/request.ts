import "server-only";

/**
 * Client-IP ermitteln. X-Forwarded-For wird nur ausgewertet, wenn TRUST_PROXY
 * gesetzt ist (Anzahl Proxy-Hops). Nginx hängt die echte Client-IP rechts an,
 * daher zählen wir von rechts – so kann ein Client die Kette nicht fälschen.
 */
export function clientIp(headers: Headers, trustProxyHops: number): string {
  if (trustProxyHops > 0) {
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
      const idx = parts.length - trustProxyHops;
      const ip = parts[Math.max(0, idx)];
      if (ip) return ip;
    }
    const real = headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "unbekannt";
}
