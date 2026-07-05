import type { Metadata } from "next";

import { InfoPage } from "@/components/landing/info-page";

export const metadata: Metadata = {
  title: "隐私政策 - 智链",
  description: "智链平台隐私政策。",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="隐私政策"
      title="隐私政策"
      description="以下内容为基础隐私说明，正式上线前应结合实际数据流、第三方服务和部署环境进行法务审阅。"
      sections={[
        {
          title: "我们收集的信息",
          body: "为了提供分析服务，平台可能处理用户账号信息、工作区信息、项目配置、官网 URL、品牌信息和分析结果快照。",
        },
        {
          title: "信息用途",
          body: "相关信息用于创建项目、执行官网分析、生成审计报告、提供内容洞察、维护服务安全以及改进产品质量。",
        },
        {
          title: "数据保护",
          body: "平台应通过访问控制、租户隔离、日志审计和必要的安全策略保护用户数据，避免未经授权的访问或泄露。",
        },
        {
          title: "第三方服务",
          body: "部分分析能力可能依赖模型服务、抓取服务或基础设施服务。正式上线前应明确列出第三方服务和数据处理边界。",
        },
      ]}
    />
  );
}
