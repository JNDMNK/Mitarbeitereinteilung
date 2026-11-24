import { getSettings } from "@/server/services/settings";
import type { Metadata } from "next";
import { BackLink } from "@/components/masterdata/shared";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";
import { listSites } from "@/server/services/masterdata/sites";
import { SiteAdmin } from "./site-admin";

export const metadata: Metadata = { title: "Baustellen" };

export default async function SitesPage() {
  const session = await requirePagePermission("masterdata.edit");
  const settings = await getSettings();
  const sites = await listSites();
  return (
    <>
      <LiveRefresh scopes={["masterdata"]} />
      <BackLink />
      <PageHeader title="Baustellen" />
      <SiteAdmin autoDeleteDays={settings.autoDeleteSiteDays} sites={sites} isAdmin={session.user.role === "ADMIN"} />
    </>
  );
}
