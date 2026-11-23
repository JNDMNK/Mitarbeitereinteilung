import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Einteilung", template: "%s · Einteilung" },
  description: "Tägliche Einteilung von Monteuren, Fahrzeugen und Baustellen",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d5fd1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
