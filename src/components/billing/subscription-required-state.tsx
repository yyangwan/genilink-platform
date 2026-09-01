"use client";

import { LockKeyhole } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface SubscriptionRequiredStateProps {
  feature?: string;
  className?: string;
}

export function SubscriptionRequiredState({
  feature = "该功能",
  className,
}: SubscriptionRequiredStateProps) {
  return (
    <div className={className}>
      <EmptyState
        icon={LockKeyhole}
        title="订阅套餐后即可使用"
        description={`${feature}属于订阅功能。选择适合的套餐后，即可开始使用并查看分析数据。`}
        actionLabel="查看订阅套餐"
        actionHref="/settings/billing"
      />
    </div>
  );
}
