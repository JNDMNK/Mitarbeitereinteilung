import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Einteilung", template: "%s · Einteilung" },
  description: "Tägliche Einteilung von Monteuren, Fahrzeugen und Baustellen",
  robots: { index: false, follow: false },
  icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Einteilung", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#a50d26",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
