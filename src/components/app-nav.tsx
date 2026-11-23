"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/navigation";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function DesktopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Hauptnavigation">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={`rounded-lg px-3 py-2 font-semibold ${
            isActive(pathname, item.href) ? "bg-white/20 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Untere Tab-Leiste auf dem Smartphone: große Touchflächen */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const all = [...items, { href: "/konto", label: "Konto", short: "Konto", icon: "⚙️", permission: "planning.view" as const }];
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Hauptnavigation"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
        {all.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  active ? "text-brand-700" : "text-muted"
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {item.icon}
                </span>
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
