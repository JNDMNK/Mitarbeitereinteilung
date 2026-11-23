import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mitarbeitereinteilung",
    short_name: "Einteilung",
    description: "Einteilung von Monteuren, Fahrzeugen und Baustellen",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#a50d26",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
