import "server-only";
import { forbidden } from "./errors";

/**
 * CSRF-Schutz in zwei Stufen:
 *  1. Origin-Prüfung: Origin (bzw. Referer) muss der APP_URL entsprechen.
 *     Fehlen beide, muss der Browser "Sec-Fetch-Site: same-origin" melden.
 *  2. Synchronizer-Token: Header X-CSRF-Token == Token der Sitzung
 *     (entfällt nur beim Login, wo es noch keine Sitzung gibt).
 */
export function checkOrigin(headers: Headers, appOrigin: string): void {
  const origin = headers.get("origin");
  if (origin) {
    if (origin !== appOrigin) throw forbidden("Ungültige Herkunft der Anfrage (CSRF-Schutz).");
    return;
  }
  const referer = headers.get("referer");
  if (referer) {
    let refOrigin: string | null = null;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      /* ungültig */
    }
    if (refOrigin !== appOrigin) throw forbidden("Ungültige Herkunft der Anfrage (CSRF-Schutz).");
    return;
  }
  if (headers.get("sec-fetch-site") !== "same-origin") {
    throw forbidden("Ungültige Herkunft der Anfrage (CSRF-Schutz).");
  }
}

export function checkCsrfToken(headers: Headers, expected: string, equal: (a: string, b: string) => boolean): void {
  const sent = headers.get("x-csrf-token");
  if (!sent || !equal(sent, expected)) {
    throw forbidden("Sicherheitstoken ungültig. Bitte die Seite neu laden.");
  }
}
