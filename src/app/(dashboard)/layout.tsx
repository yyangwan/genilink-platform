import { cookies } from "next/headers";
import Sidebar from "@/components/sidebar/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get("genilink-workspace");
  const workspaceId = workspaceCookie?.value ?? null;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)" }}>
      <Sidebar />

      {/* Main content area — offset by sidebar width on desktop */}
      <main
        className="flex-1 min-h-screen lg:pl-[240px]"
        style={{
          fontFamily: "var(--font-body)",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
