import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPage } from "@/components/landing/landing-page";
import { auth } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "智链 - AI 可见性增长平台",
  description:
    "免费诊断官网在 AI 搜索和大模型问答中的可理解度，发现品牌可见性、产品表达和内容增长机会。",
};

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
