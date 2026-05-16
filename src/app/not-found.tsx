import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-6"
      style={{ background: "var(--bg-base)" }}
    >
      <h1
        className="text-6xl font-bold mb-4"
        style={{
          color: "var(--color-primary)",
          fontFamily: "var(--font-display)",
        }}
      >
        404
      </h1>
      <p
        className="text-lg mb-8"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        页面未找到
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background: "var(--color-primary)",
          color: "#0b0d14",
          fontFamily: "var(--font-display)",
        }}
      >
        返回首页
      </Link>
    </div>
  );
}
