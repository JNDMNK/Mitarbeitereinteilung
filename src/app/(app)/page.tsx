import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/roles";
import { requirePageSession } from "@/server/page-auth";

export default async function Home() {
  const { user } = await requirePageSession();
  redirect(homePathFor(user.role));
}
