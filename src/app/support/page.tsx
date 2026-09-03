import type { Metadata } from "next";

import { InfoPage } from "@/components/landing/info-page";

export const metadata: Metadata = {
  title: "帮助支持 - 智链",
  description: "智链平台帮助支持入口。",
};

export default function SupportPage() {
  return (
    <InfoPage
      eyebrow="帮助支持"
      title="需要帮助时，可以从这里开始"
      description="这里提供智链平台的使用支持、产品咨询和问题反馈入口。你可以发送邮件至 support@genilink.cn 联系客服。"
      sections={[
        {
          title: "产品使用支持",
          body: "如果你在项目创建、官网分析、AI 可见性审计或内容洞察中遇到问题，可以联系支持团队协助定位。",
        },
        {
          title: "企业咨询",
          body: "如果你的团队需要托管运营按结果付费、更多项目与分析额度、定制平台接入或私有化部署，请发送邮件至 support@genilink.cn 沟通。",
        },
        {
          title: "问题反馈",
          body: "欢迎反馈报告准确性、平台覆盖、分析建议和内容生成质量相关问题，我们会持续改进模型和工作流。",
        },
      ]}
    />
  );
}
