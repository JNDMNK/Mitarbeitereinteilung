import { db } from "@/server/db";

// Für Docker-HEALTHCHECK und Monitoring; ohne Login, ohne Daten
export async function GET() {
  try {
    await db.$queryRawUnsafe("SELECT 1");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
