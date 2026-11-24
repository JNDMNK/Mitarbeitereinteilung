import Link from "next/link";
import { Brand } from "@/components/brand";
import { DesktopNav, MobileNav } from "@/components/app-nav";
import { LogoutButton } from "@/components/logout-button";
import { MainContainer } from "@/components/main-container";
import { NAV_ITEMS } from "@/lib/navigation";
import { can, ROLE_LABELS } from "@/lib/roles";
import { db } from "@/server/db";
import { requirePageSession } from "@/server/page-auth";
import { logoUrl } from "@/server/services/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  const { user } = session;
  const items = NAV_ITEMS.filter(
    (i) => can(user.role, i.permission) && (i.href !== "/meine-einteilung" || user.employeeId),
  );
  const settings = await db.appSettings.findUnique({ where: { id: 1 }, select: { companyName: true, logoFile: true } });
  const displayName = user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.username;

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <meta name="csrf-token" content={session.csrfToken} />
      <header className="no-print sticky top-0 z-30 bg-brand-700 text-white shadow">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-3 md:px-6">
          <Link href="/" className="min-w-0">
            <Brand companyName={settings?.companyName ?? "Einteilung"} logoUrl={logoUrl(settings?.logoFile ?? null)} />
          </Link>
          <DesktopNav items={items} />
          <div className="ml-auto flex items-center gap-2">
            <Link href="/konto" className="hidden rounded-lg px-3 py-2 text-right leading-tight hover:bg-white/10 md:block">
              <span className="block font-semibold">{displayName}</span>
              <span className="block text-xs text-white/80">{ROLE_LABELS[user.role]}</span>
            </Link>
            <span className="text-sm text-white/85 md:hidden">{displayName}</span>
            <div className="hidden md:block">
              <LogoutButton variant="ghost" className="text-white hover:bg-white/10" />
            </div>
          </div>
        </div>
      </header>
      <MainContainer>{children}</MainContainer>
      <MobileNav items={items} />
    </div>
  );
}
