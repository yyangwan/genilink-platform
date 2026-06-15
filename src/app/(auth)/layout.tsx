import React from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: "var(--bg-base)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-[1fr_1fr] rounded-2xl overflow-hidden" style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Brand panel */}
        <div
          className="hidden md:flex flex-col items-center justify-center p-10"
          style={{
            background: "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-card) 100%)",
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4"
            style={{
              background: "var(--color-primary-dim)",
              color: "var(--color-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            智
          </div>
          <h1
            className="text-xl font-semibold tracking-tight mb-2"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            智链
          </h1>
          <p
            className="text-sm text-center max-w-[200px]"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            中国GEO全链路平台
            <br />
            AI搜索可见性 + 内容创作
          </p>
        </div>

        {/* Auth form area */}
        <div className="p-8 md:p-10 flex items-center justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}
