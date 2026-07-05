import type { Metadata } from "next";

import { InfoPage } from "@/components/landing/info-page";
import { faqItems } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "FAQ - 智链",
  description: "关于智链官网诊断、AI 可见性审计、内容洞察、智创内容生成、内容日历和竞品分析的常见问题。",
};

export default function FaqPage() {
  return (
    <InfoPage
      eyebrow="FAQ"
      title="常见问题"
      description="这里整理了客户最常问的问题，帮助你快速了解智链能分析什么、如何使用，以及这些能力如何支持 AI 搜索和 GEO 增长。"
      sections={faqItems}
    />
  );
}
