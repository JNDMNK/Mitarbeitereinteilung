import "server-only";
import { forbidden } from "./errors";

/**
 * CSRF-Schutz in zwei Stufen:
 *  1. Origin-Prüfung: Origin (bzw. Referer) muss der APP_URL entsprechen.
 *     Fehlen beide, muss der Browser "Sec-Fetch-Site: same-origin" melden.
 *  2. Synchronizer-Token: Header X-CSRF-Token == Token der Sitzung
 *     (entfällt nur beim Login, wo es noch keine Sitzung gibt).
 */
function reject(received: string | null, appOrigin: string): never {
  // Hilft bei der Einrichtung (z. B. APP_URL ohne Port hinter einer Portfreigabe)
  console.warn(`[csrf] Anfrage abgelehnt: Herkunft "${received ?? "unbekannt"}" passt nicht zu APP_URL "${appOrigin}".`);
  throw forbidden(`Ungültige Herkunft der Anfrage (CSRF-Schutz). Die App wird unter ${received ?? "einer anderen Adresse"} aufgerufen, eingerichtet ist ${appOrigin}.`);
}

export function checkOrigin(headers: Headers, appOrigin: string): void {
  const origin = headers.get("origin");
  if (origin) {
    if (origin !== appOrigin) reject(origin, appOrigin);
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
    if (refOrigin !== appOrigin) reject(refOrigin, appOrigin);
    return;
  }
  if (headers.get("sec-fetch-site") !== "same-origin") reject(null, appOrigin);
}

export function checkCsrfToken(headers: Headers, expected: string, equal: (a: string, b: string) => boolean): void {
  const sent = headers.get("x-csrf-token");
  if (!sent || !equal(sent, expected)) {
    throw forbidden("Sicherheitstoken ungültig. Bitte die Seite neu laden.");
  }
}
