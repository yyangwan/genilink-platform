import { cookies } from "next/headers";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/sidebar/sidebar";
import { ProjectProviderWrapper } from "@/components/project/project-provider";
import { ContextBar } from "@/components/project/context-bar";
import { ProjectWizard } from "@/components/project/project-wizard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  let workspaceCookie = cookieStore.get("genilink-workspace");

  // Auto-recover: if no workspace cookie but user is logged in, pick first workspace
  if (!workspaceCookie?.value) {
    const session = await auth();
    if (session?.user?.id) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId: session.user.id },
        orderBy: { joinedAt: "asc" },
        select: { workspaceId: true },
      });
      if (membership) {
        cookieStore.set("genilink-workspace", membership.workspaceId, {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 365 * 24 * 60 * 60,
          path: "/",
        });
        workspaceCookie = { name: "genilink-workspace", value: membership.workspaceId };
      }
    }
  }

  const workspaceId = workspaceCookie?.value ?? null;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)" }}>
      <Sidebar />

      {/* Main content area — offset by sidebar width on desktop */}
      <main
        id="main-content"
        className="flex-1 min-h-screen lg:pl-[220px]"
        style={{
          fontFamily: "var(--font-body)",
        }}
      >
        <ProjectProviderWrapper workspaceId={workspaceId}>
          <ContextBar />
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
            {children}
          </div>
          <ProjectWizard />
        </ProjectProviderWrapper>
      </main>
    </div>
  );
}
