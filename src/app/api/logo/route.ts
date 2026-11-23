import { readLogo } from "@/server/services/settings";

// Öffentlich (auch auf der Login-Seite sichtbar). Enthält keine Planungsdaten.
export async function GET(req: Request) {
  const logo = await readLogo();
  if (!logo) return new Response("Kein Logo", { status: 404 });
  const versioned = new URL(req.url).searchParams.get("v") === logo.file;
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Content-Length": String(logo.data.byteLength),
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
