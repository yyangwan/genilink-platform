import { cookies } from "next/headers";
import { auth } from "@/lib/auth/config";
import Sidebar from "@/components/sidebar/sidebar";
import { ProjectProviderWrapper } from "@/components/project/project-provider";
import { ContextBar } from "@/components/project/context-bar";
import { ProjectWizard } from "@/components/project/project-wizard";
import { resolveWorkspaceId } from "@/lib/auth/get-workspace";
import { effectiveSystemRole } from "@/lib/auth/ops";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await auth();
  const [workspaceId, currentUser] = session?.user?.id
    ? await Promise.all([
        resolveWorkspaceId(
          session.user.id,
          cookieStore.get("genilink-workspace")?.value,
        ),
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { id: true, systemRole: true },
        }),
      ])
    : [null, null];
  const showOps = currentUser
    ? ["ops", "admin"].includes(effectiveSystemRole(currentUser))
    : false;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)" }}>
      <Sidebar showOps={showOps} />

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
