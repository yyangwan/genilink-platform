"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Clock3,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatDateInTimeZone } from "@/lib/time";

type BillingCycle = "monthly" | "yearly";
type ModuleType = "visibility" | "content";
type PaymentProvider = "wechatpay" | "alipay";

type BillingPlan = {
  id: string;
  key: string;
  module: ModuleType;
  billingCycle: BillingCycle;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  provider: PaymentProvider;
  checkoutUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  configured?: boolean;
};

type Subscription = {
  id: string;
  module: ModuleType;
  status: string;
  billingCycle: BillingCycle;
  createdAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  billingPlanId: string | null;
  provider: string | null;
  providerSubscriptionId: string | null;
};

type BillingOverview = {
  plans: BillingPlan[];
  subscriptions: Subscription[];
  billingDisabled: boolean;
  providerAvailability?: {
    wechatpay?: boolean;
    alipay?: boolean;
  };
};

type CheckoutProvider = PaymentProvider;

const MODULE_LABELS: Record<ModuleType, string> = {
  visibility: "可见性",
  content: "创作",
};

const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "月付",
  yearly: "年付",
};

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  wechatpay: "微信支付",
  alipay: "支付宝",
};

function formatPrice(priceCents: number, currency: string) {
  if (priceCents <= 0) {
    return "待配置";
  }
  const value = priceCents / 100;
  if (currency.toUpperCase() === "CNY") {
    return `¥${value.toFixed(2)}`;
  }
  return `${currency.toUpperCase()} ${value.toFixed(2)}`;
}

export default function BillingSettingsPage() {
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPendingKey, setCheckoutPendingKey] = useState<string | null>(null);
  const [selectedProviderByPlanKey, setSelectedProviderByPlanKey] = useState<Record<string, CheckoutProvider>>({});
  const accessSyncAttemptedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/billing/plans", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: BillingOverview) => {
        setOverview(data);
        setError(null);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setError("订阅数据加载失败");
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!overview?.plans?.length) return;

    setSelectedProviderByPlanKey((current) => {
      const next = { ...current };
      let changed = false;

      for (const plan of overview.plans) {
        if (next[plan.key]) continue;

        const wechatAvailable = overview.providerAvailability?.wechatpay ?? false;
        const alipayAvailable = overview.providerAvailability?.alipay ?? false;
        const defaultProvider = plan.provider;
        const chosen =
          defaultProvider === "wechatpay" && wechatAvailable
            ? "wechatpay"
            : defaultProvider === "alipay" && alipayAvailable
              ? "alipay"
              : wechatAvailable
                ? "wechatpay"
                : alipayAvailable
                  ? "alipay"
                  : defaultProvider;

        next[plan.key] = chosen;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [overview]);

  const activeSubscriptions = useMemo(() => {
    return (overview?.subscriptions ?? []).filter(
      (sub) => sub.status === "active" || sub.status === "trialing",
    );
  }, [overview]);

  const checkoutState = searchParams.get("checkout");
  const checkoutOrderId = searchParams.get("orderId");

  useEffect(() => {
    if (checkoutState !== "success" || !overview?.workspaceId || accessSyncAttemptedRef.current) {
      return;
    }

    accessSyncAttemptedRef.current = true;

    fetch("/api/billing/access", {
      method: "POST",
    }).catch(() => {
      accessSyncAttemptedRef.current = false;
    });
  }, [checkoutState, overview?.workspaceId]);

  const handleCheckout = async (planKey: string) => {
    setCheckoutPendingKey(planKey);
    setError(null);

    const provider = selectedProviderByPlanKey[planKey];

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, provider }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && data?.code === "ACTIVE_SUBSCRIPTION_EXISTS") {
          setError("该模块已有有效订阅，无需重复购买。");
          return;
        }
        if (res.status === 503) {
          setError("收款配置尚未完成，请先补齐支付环境变量。");
          return;
        }
        throw new Error(data?.error || "checkout failed");
      }

      const checkoutUrl = data?.checkoutUrl as string | undefined;
      if (!checkoutUrl) {
        throw new Error("missing checkout url");
      }

      window.location.assign(checkoutUrl);
    } catch {
      setError("创建收款链接失败");
    } finally {
      setCheckoutPendingKey(null);
    }
  };

  const summaryText = overview?.billingDisabled
    ? "当前处于订阅关闭模式"
    : `已开通 ${activeSubscriptions.length} 个订阅`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-xl font-semibold"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            订阅收款
          </h1>
          <p
            className="mt-1 text-sm"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            在这里选择模块订阅、支付方式和当前有效期。
          </p>
        </div>

        <div
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
          }}
        >
          <ShieldCheck className="h-4 w-4" />
          {summaryText}
        </div>
      </div>

      {checkoutState === "success" && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-success) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 40%, transparent)",
            color: "var(--text-primary)",
          }}
        >
          <CheckCircle2 className="h-4 w-4" />
          订单已发起，若支付完成会自动开通。
          {checkoutOrderId ? `订单号：${checkoutOrderId}` : ""}
        </div>
      )}

      {checkoutState === "canceled" && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)",
            color: "var(--text-primary)",
          }}
        >
          <Sparkles className="h-4 w-4" />
          收款流程已取消。
        </div>
      )}

      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-56 rounded-xl animate-skeleton-pulse"
              style={{ background: "var(--bg-hover)" }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(overview?.plans ?? []).map((plan) => {
            const active = activeSubscriptions.some(
              (sub) =>
                sub.billingPlanId === plan.id ||
                (sub.module === plan.module && sub.billingCycle === plan.billingCycle),
            );
            const currentSub = activeSubscriptions.find(
              (sub) =>
                sub.billingPlanId === plan.id ||
                (sub.module === plan.module && sub.billingCycle === plan.billingCycle),
            );
            const disabled = active || !plan.configured || overview?.billingDisabled;
            const providerOptions = [
              overview?.providerAvailability?.wechatpay && {
                value: "wechatpay" as const,
                label: PROVIDER_LABELS.wechatpay,
              },
              overview?.providerAvailability?.alipay && {
                value: "alipay" as const,
                label: PROVIDER_LABELS.alipay,
              },
            ].filter(Boolean) as Array<{ value: CheckoutProvider; label: string }>;

            return (
              <section
                key={plan.id}
                className="rounded-xl p-6"
                style={{
                  background: "var(--bg-card)",
                  border: active ? "1px solid var(--color-success)" : "1px solid var(--border)",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2
                        className="text-base font-semibold"
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {plan.name}
                      </h2>
                      {active && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                          style={{
                            background: "color-mix(in srgb, var(--color-success) 14%, transparent)",
                            color: "var(--color-success)",
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          已开通
                        </span>
                      )}
                      {!plan.configured && !overview?.billingDisabled && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                          style={{
                            background: "var(--bg-hover)",
                            color: "var(--text-muted)",
                          }}
                        >
                          未配置
                        </span>
                      )}
                    </div>

                    <p
                      className="mt-1 text-sm"
                      style={{
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {plan.description}
                    </p>
                  </div>

                  <div className="text-right">
                    <div
                      className="text-lg font-semibold"
                      style={{
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {formatPrice(plan.priceCents, plan.currency)}
                    </div>
                    <div
                      className="text-xs"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {MODULE_LABELS[plan.module]} · {CYCLE_LABELS[plan.billingCycle]}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm">
                  <div
                    className="flex items-center gap-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <CreditCard className="h-4 w-4" />
                    默认支付方式：{PROVIDER_LABELS[plan.provider]}
                  </div>

                  {providerOptions.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {providerOptions.map((option) => {
                        const selected = selectedProviderByPlanKey[plan.key] === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                            style={{
                              background: selected ? "var(--color-primary)" : "var(--bg-hover)",
                              color: selected ? "#0b0d14" : "var(--text-secondary)",
                              fontFamily: "var(--font-body)",
                            }}
                            onClick={() =>
                              setSelectedProviderByPlanKey((current) => ({
                                ...current,
                                [plan.key]: option.value,
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {currentSub && (
                    <div
                      className="flex items-center gap-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Clock3 className="h-4 w-4" />
                      有效期至{" "}
                      {formatDateInTimeZone(currentSub.currentPeriodEnd, {
                        includeTime: false,
                        includeYear: true,
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <button
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors"
                    style={{
                      background: disabled ? "var(--bg-hover)" : "var(--color-primary)",
                      color: disabled ? "var(--text-muted)" : "#0b0d14",
                      cursor: disabled ? "not-allowed" : "pointer",
                      fontFamily: "var(--font-body)",
                    }}
                    disabled={disabled || checkoutPendingKey === plan.key}
                    onClick={() => handleCheckout(plan.key)}
                  >
                    {checkoutPendingKey === plan.key ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        跳转中
                      </>
                    ) : active ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        当前生效
                      </>
                    ) : !plan.configured || overview?.billingDisabled ? (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        待配置
                      </>
                    ) : (
                      <>
                        立即开通
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <span
                    className="text-xs"
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {active
                      ? "订阅已生效，支付入口已锁定。"
                      : providerOptions.length > 1
                        ? "可先切换支付方式，再创建订单。"
                        : `点击后将跳转到 ${PROVIDER_LABELS[plan.provider]} 收银台。`}
                  </span>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && activeSubscriptions.length > 0 && (
        <section
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <h2
            className="text-base font-semibold"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            当前有效订阅
          </h2>

          <div className="mt-4 grid gap-3">
            {activeSubscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex flex-col gap-2 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {MODULE_LABELS[sub.module]} · {sub.billingCycle === "monthly" ? "月付" : "年付"}
                  </div>
                  <div
                    className="mt-1 text-xs"
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    生效至{" "}
                    {formatDateInTimeZone(sub.currentPeriodEnd, {
                      includeTime: false,
                      includeYear: true,
                    })}
                  </div>
                </div>

                <div
                  className="text-xs"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  状态：{sub.status} · provider：{sub.provider ?? "unknown"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
