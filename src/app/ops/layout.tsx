import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OpsShell } from "@/components/ops/ops-shell";
import { OpsAuthorizationError, requireOps } from "@/lib/auth/ops";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireOps();
  } catch (error) {
    if (error instanceof OpsAuthorizationError) {
      if (error.status === 401) redirect("/auth/login?callbackUrl=%2Fops");
      notFound();
    }
    throw error;
  }

  return <OpsShell userLabel={user.name || user.email || "运营账号"}>{children}</OpsShell>;
}
