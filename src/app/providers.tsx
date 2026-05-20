"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/toast-context";
import { ToastRenderer } from "@/components/ui/toast-renderer";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        {children}
        <ToastRenderer />
      </ToastProvider>
    </SessionProvider>
  );
}
