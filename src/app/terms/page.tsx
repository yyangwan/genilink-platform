import type { Metadata } from "next";

import { InfoPage } from "@/components/landing/info-page";

export const metadata: Metadata = {
  title: "服务条款 - 智链",
  description: "智链平台服务条款。",
};

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="服务条款"
      title="服务条款"
      description="以下内容为基础服务条款说明，正式上线前应由法务根据实际服务范围、计费方式和数据处理流程审阅。"
      sections={[
        {
          title: "服务范围",
          body: "智链提供官网分析、AI 可见性审计、竞品对比、内容洞察和相关报告能力。具体可用功能以账户权限和订阅配置为准。",
        },
        {
          title: "用户责任",
          body: "用户应确保提交分析的网站、品牌、项目和内容信息具有合法使用权，不得将平台用于违法、侵权或绕过第三方限制的用途。",
        },
        {
          title: "分析结果",
          body: "平台输出的评分、建议和报告用于辅助决策，不构成保证性承诺。用户应结合自身业务判断后再执行优化动作。",
        },
        {
          title: "服务变更",
          body: "平台可能根据产品迭代、上游平台变化和安全要求调整功能、额度和可用范围，并会尽量提前通知受影响用户。",
        },
      ]}
    />
  );
}
