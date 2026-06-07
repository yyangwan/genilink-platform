import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "智链 — GEO全链路平台",
  description: "AI搜索可见性追踪 + 内容创作 + 统一管理平台",
};

const themeScript = `
(function() {
  try {
    var cookie = document.cookie.match(/genilink-theme=(dark|light)/);
    var theme = cookie ? cookie[1] : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <a href="#main-content" className="skip-to-content">
            跳到主要内容
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
