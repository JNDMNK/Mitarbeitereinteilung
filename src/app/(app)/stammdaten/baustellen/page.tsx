import type { Metadata } from "next";
import { BackLink } from "@/components/masterdata/shared";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";
import { listSites } from "@/server/services/masterdata/sites";
import { SiteAdmin } from "./site-admin";

export const metadata: Metadata = { title: "Baustellen" };

export default async function SitesPage() {
  await requirePagePermission("masterdata.edit");
  const sites = await listSites();
  return (
    <>
      <BackLink />
      <PageHeader title="Baustellen" />
      <SiteAdmin sites={sites} />
    </>
  );
}
