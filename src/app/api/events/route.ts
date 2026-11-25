import { can } from "@/lib/roles";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { changeBus, type ChangeEvent } from "@/server/events";

// Server-Sent Events: meldet Änderungen sofort an alle offenen Clients.
// Hinter Nginx: proxy_buffering off + lange Timeouts (siehe README); zusätzlich X-Accel-Buffering: no.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Bitte anmelden.", { status: 401 });
  if (!can(session.user.role, "planning.view") && !can(session.user.role, "display.view")) return new Response("Keine Berechtigung.", { status: 403 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const close = () => {
        if (closed) return;
        cleanup();
        try {
          controller.close();
        } catch {
          /* bereits geschlossen */
        }
      };

      const onChange = (e: ChangeEvent) => {
        const payload = { scope: e.scope, dates: e.dates ?? [], self: e.userId === session.user.id, at: e.at };
        send(`event: change\ndata: ${JSON.stringify(payload)}\n\n`);
      };
      changeBus.on("change", onChange);

      // Herzschlag hält Proxys offen und prüft, ob die Sitzung noch gültig ist
      const heartbeat = setInterval(async () => {
        const valid = await db.session
          .findUnique({ where: { id: session.sessionId }, select: { expiresAt: true } })
          .then((s) => !!s && s.expiresAt > new Date())
          .catch(() => true);
        if (!valid) {
          send(`event: logout\ndata: {}\n\n`);
          close();
          return;
        }
        send(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        changeBus.off("change", onChange);
      };

      req.signal.addEventListener("abort", close);
      // Reconnect-Wartezeit für den Browser + Begrüßung (Client weiß: verbunden)
      send(`retry: 5000\n\nevent: hello\ndata: {}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
