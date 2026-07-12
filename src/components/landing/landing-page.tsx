"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  FileText,
  Globe2,
  LineChart,
  Mail,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

import styles from "./landing-page.module.css";

const productModules = [
  {
    id: "website",
    image: "/landing/screens/website-analysis.png",
    video: "/landing/videos/landing-website-analysis.webm",
    icon: Globe2,
    label: "网站分析",
    title: "先看清官网是否适合被 AI 抓取和理解",
    body: "检查官网结构、页面语义、Schema、内容完整度和可引用信号，快速定位最该优化的页面。",
    metric: "82",
    metricLabel: "官网可理解度",
    rows: [
      ["产品表达", "78", "+12 可提升"],
      ["语义结构", "84", "健康"],
      ["AI 引用准备", "63", "需补强"],
    ],
  },
  {
    id: "visibility",
    image: "/landing/screens/visibility-audit.png",
    video: "/landing/videos/landing-visibility-audit.webm",
    icon: Radar,
    label: "AI 可见性审计",
    title: "看清品牌在主流 AI 回答里有没有出现",
    body: "围绕真实业务问题检测 DeepSeek、Kimi、通义、豆包等平台，追踪品牌提及、推荐位置和竞品表现。",
    metric: "5+",
    metricLabel: "AI 平台覆盖",
    rows: [
      ["DeepSeek", "76", "品牌被提及"],
      ["Kimi", "68", "需要补充案例页"],
      ["通义千问", "84", "表现稳定"],
    ],
  },
  {
    id: "report",
    image: "/landing/screens/audit-reports.png",
    video: "/landing/videos/landing-audit-report.webm",
    icon: FileText,
    label: "审计报告",
    title: "把审计结果整理成能直接汇报的报告",
    body: "自动汇总总分、平台表现、关键发现和优先级建议，方便市场、内容和管理层快速对齐下一步动作。",
    metric: "10",
    metricLabel: "高优先级建议",
    rows: [
      ["报告摘要", "A-", "可分享"],
      ["关键发现", "10", "已排序"],
      ["行动项", "7", "可转 brief"],
    ],
  },
  {
    id: "content",
    image: "/landing/screens/content-insights.png",
    video: "/landing/videos/landing-content-insights.webm",
    icon: Sparkles,
    label: "内容洞察",
    title: "把 AI 可见性缺口变成下一批内容选题",
    body: "根据缺失场景、FAQ、关键词覆盖和竞品差距，生成内容建议、选题 brief 和页面优化任务。",
    metric: "14",
    metricLabel: "内容机会",
    rows: [
      ["场景页", "高", "补齐行业方案"],
      ["FAQ", "中", "回答采购问题"],
      ["案例", "高", "强化可信信号"],
    ],
  },
  {
    id: "creation",
    image: "/landing/screens/dashboard-overview.png",
    video: "/landing/videos/landing-ai-content-creation.webm",
    icon: Target,
    label: "智创内容生成",
    title: "从选题 brief 生成可编辑的内容初稿",
    body: "把洞察结论、关键词、业务场景和品牌语气转成内容草稿，团队可以继续润色、审核和发布。",
    metric: "3",
    metricLabel: "创作步骤",
    rows: [
      ["选题 brief", "1", "自动生成"],
      ["AI 初稿", "2", "可编辑"],
      ["人工润色", "3", "可审核"],
    ],
  },
  {
    id: "calendar",
    image: "/landing/screens/dashboard-overview.png",
    video: "/landing/videos/landing-content-calendar.webm",
    icon: LineChart,
    label: "智创内容日历",
    title: "把内容计划排进日历，持续跟踪进度",
    body: "统一管理选题、负责人、发布时间和渠道状态，让内容生产不只停留在生成初稿，而是持续推进到发布。",
    metric: "12",
    metricLabel: "排期内容",
    rows: [
      ["选题计划", "12", "本月"],
      ["协作状态", "4", "待审核"],
      ["发布排期", "8", "已安排"],
    ],
  },
  {
    id: "compare",
    image: "/landing/screens/competitor-analysis.png",
    video: "/landing/videos/landing-competitor-analysis.webm",
    icon: BarChart3,
    label: "竞品分析",
    title: "用同一套问题比较你和竞品的 AI 表现",
    body: "识别竞品在哪些平台更常被提及、哪些内容更容易被推荐，以及你的品牌应该优先追赶哪些主题。",
    metric: "2.4x",
    metricLabel: "竞品差距",
    rows: [
      ["自有品牌", "42", "直接提及"],
      ["竞品 A", "67", "平台覆盖领先"],
      ["竞品 B", "55", "案例引用更多"],
    ],
  },
];

type BillingCycle = "monthly" | "yearly";
type PaymentProvider = "wechatpay" | "alipay";

type PricingPlanRecord = {
  id: string;
  key: string;
  module: "visibility" | "content" | "api_access";
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

type PricingOverview = {
  plans: PricingPlanRecord[];
  billingDisabled: boolean;
  providerAvailability?: {
    wechatpay?: boolean;
    alipay?: boolean;
  };
};

const PRICING_CARDS = [
  {
    key: "visibility",
    title: "可视性分析",
    eyebrow: "入门方案",
    description: "先把官网诊断、AI 可见性审计和报告跑通。",
    features: ["官网诊断", "AI 可见性审计", "审计报告", "竞品对比"],
    badge: "最快上手",
    cta: "开通可视性",
    accent: "var(--color-primary)",
    module: "visibility" as const,
    highlight: false,
  },
  {
    key: "content",
    title: "内容增长",
    eyebrow: "推荐",
    description: "持续做内容洞察、创作和排期的主力方案。",
    features: ["内容洞察", "创作草稿", "内容日历", "优先支持"],
    badge: "最受欢迎",
    cta: "开通内容版",
    accent: "var(--color-ai-accent)",
    module: "content" as const,
    highlight: true,
  },
  {
    key: "team",
    title: "团队定制",
    eyebrow: "企业版",
    description: "适合多品牌、多 workspace 和更深度协作。",
    features: ["全部模块", "专属对接", "自定义集成", "团队权限"],
    badge: "定制方案",
    cta: "联系顾问",
    accent: "var(--color-warning)",
    module: null,
    highlight: false,
  },
] as const;

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function formatPlanPrice(priceCents: number, currency: string) {
  if (priceCents <= 0) {
    return "未定价";
  }

  const value = priceCents / 100;
  if (currency.toUpperCase() === "CNY") {
    return `¥${value.toFixed(2)}`;
  }
  return `${currency.toUpperCase()} ${value.toFixed(2)}`;
}

export function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pricingOverview, setPricingOverview] = useState<PricingOverview | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [activeModuleId, setActiveModuleId] = useState(productModules[0].id);

  const encodedUrl = useMemo(() => encodeURIComponent(normalizeUrl(url)), [url]);
  const registerHref = encodedUrl
    ? `/auth/register?source=website-diagnosis&targetUrl=${encodedUrl}`
    : "/auth/register?source=website-diagnosis";
  const loginHref = encodedUrl
    ? `/auth/login?callbackUrl=${encodeURIComponent(`/website-analysis?targetUrl=${encodedUrl}`)}`
    : "/auth/login";

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/billing/plans", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: PricingOverview) => {
        setPricingOverview(data);
      })
      .catch(() => {
        setPricingOverview(null);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const sections = productModules
      .map((item) => document.getElementById(`module-${item.id}`))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target.id) {
          setActiveModuleId(visible.target.id.replace("module-", ""));
        }
      },
      {
        root: null,
        rootMargin: "-28% 0px -46% 0px",
        threshold: [0.18, 0.35, 0.55, 0.75],
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  const pricingPlansByKey = new Map((pricingOverview?.plans ?? []).map((plan) => [plan.key, plan]));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeUrl(url);

    try {
      const parsed = new URL(normalized);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("INVALID_PROTOCOL");
      }
      setError("");
      router.push(`/auth/register?source=website-diagnosis&targetUrl=${encodeURIComponent(parsed.href)}`);
    } catch {
      setError("请输入有效的官网地址，例如 https://example.com");
    }
  }

  return (
    <main id="main-content" className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="智链首页">
          <span className={styles.brandMark}>智</span>
          <span>
            <strong>智链</strong>
            <small>GeniLink</small>
          </span>
        </Link>
        <nav className={styles.navLinks} aria-label="主导航">
          <a href="#product">核心功能</a>
          <a href="#pricing">订阅方案</a>
          <a href="#questions">常见问题</a>
          <a href="/blog">知识普及</a>
        </nav>
        <div className={styles.navActions}>
          <Link href={loginHref} className={styles.ghostButton}>
            登录
          </Link>
          <Link href={registerHref} className={styles.navButton}>
            免费诊断官网
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <ShieldCheck size={16} />
            面向中国 B2B 团队的 AI 搜索增长平台
          </div>
          <h1>
            智链 AI 搜索增长平台
          </h1>
          <p className={styles.lede}>
            让你的官网成为<span className={styles.nowrap}>AI答案</span>里的可信来源。
            从官网诊断、AI 可见性审计到内容生成和排期，把增长动作放进同一个工作台。
          </p>

          <form className={styles.diagnosisForm} action="/auth/register" method="get" onSubmit={handleSubmit}>
            <input type="hidden" name="source" value="website-diagnosis" />
            <label htmlFor="website-url">输入官网，开始免费诊断</label>
            <div className={styles.inputRow}>
              <Globe2 size={18} aria-hidden />
              <input
                id="website-url"
                name="targetUrl"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://your-company.com"
                inputMode="url"
                autoComplete="url"
              />
              <button type="submit">
                <FileSearch size={16} />
                免费诊断官网
              </button>
            </div>
            {error ? <p className={styles.errorText}>{error}</p> : null}
            <p className={styles.formNote}>提交官网后注册/登录，即可体验基础网站分析，查看官网被 AI 理解和引用的准备情况。</p>
          </form>

          <div className={styles.heroStats} aria-label="平台能力摘要">
            <span>
              <strong>7</strong>
              类官网诊断指标
            </span>
            <span>
              <strong>5+</strong>
              主流 AI 平台检测
            </span>
            <span>
              <strong>24h</strong>
              审计结果可复盘
            </span>
          </div>
        </div>

        <AnimatedConsole active={productModules[0]} />
      </section>

      <section id="product" className={styles.productBand}>
        <div className={styles.sectionHeader}>
          <span>平台核心功能</span>
          <h2>从官网诊断到内容增长，覆盖 AI 搜索优化的关键环节</h2>
          <p>
            你可以先用官网分析找到基础问题，再通过 AI 可见性审计、审计报告、内容洞察、智创内容生成、内容日历和竞品分析，把诊断结果落到具体增长动作。
          </p>
        </div>

        <div className={styles.productShowcase}>
          <div className={styles.moduleTabs} aria-label="平台核心功能导航">
            {productModules.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.id}
                  className={activeModuleId === item.id ? styles.moduleTabActive : styles.moduleTab}
                  href={`#module-${item.id}`}
                  aria-current={activeModuleId === item.id ? "true" : undefined}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <ChevronRight size={15} />
                </a>
              );
            })}
          </div>

          <div className={styles.moduleStack}>
            {productModules.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.id} id={`module-${item.id}`} className={styles.moduleDetail}>
                  <div className={styles.moduleCopy}>
                    <span>
                      <Icon size={16} />
                      {item.label}
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                  <ProductShot active={item} />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pricing" className={styles.pricingBand}>
        <div className={styles.pricingInner}>
          <div className={styles.pricingHero}>
            <div>
              <span className={styles.pricingHeroEyebrow}>订阅方案</span>
              <h2>选择适合当前阶段的增长方案</h2>
              <p>先用诊断和审计确认机会，再按需扩展到内容生产、排期和团队协作。微信支付与支付宝会根据可用配置自动启用。</p>
            </div>
            <div className={styles.pricingHeroTrust}>
              <span>微信支付</span>
              <span>支付宝</span>
              <span>按月试用</span>
              <span>按年放大</span>
            </div>
          </div>
        </div>

        <div className={styles.pricingMatrix}>
          <div className={styles.pricingControls} role="tablist" aria-label="订阅周期切换">
            <button
              type="button"
              className={billingCycle === "monthly" ? styles.pricingToggleActive : styles.pricingToggle}
              aria-pressed={billingCycle === "monthly"}
              onClick={() => setBillingCycle("monthly")}
            >
              月付
            </button>
            <button
              type="button"
              className={billingCycle === "yearly" ? styles.pricingToggleActive : styles.pricingToggle}
              aria-pressed={billingCycle === "yearly"}
              onClick={() => setBillingCycle("yearly")}
            >
              年付
            </button>
          </div>

          <div className={styles.pricingGrid}>
            {PRICING_CARDS.map((card) => {
              const planKey = card.module ? `${card.module}-${billingCycle}` : null;
              const plan = planKey ? pricingPlansByKey.get(planKey) : null;
              const priceLabel = plan ? formatPlanPrice(plan.priceCents, plan.currency) : "联系销售";
              const cycleLabel = plan ? (billingCycle === "monthly" ? "/月" : "/年") : "";
              const ctaHref = card.module
                ? `${registerHref}&planKey=${encodeURIComponent(plan?.key ?? planKey ?? "")}`
                : "/support";

              return (
                <article
                  key={card.key}
                  className={card.highlight ? styles.pricingCardFeatured : styles.pricingCard}
                >
                  <div className={styles.pricingCardTop}>
                    <div>
                      <span className={styles.pricingEyebrow}>{card.eyebrow}</span>
                      <h3>{card.title}</h3>
                      <p>{card.description}</p>
                    </div>
                    <span className={styles.pricingBadge} style={{ color: card.accent }}>
                      {card.badge}
                    </span>
                  </div>

                  <div className={styles.pricingPriceRow}>
                    <div className={styles.pricingPrice}>{priceLabel}</div>
                    <div className={styles.pricingCycle}>{cycleLabel || " / 定制"}</div>
                  </div>

                  <ul className={styles.pricingFeatures}>
                    {card.features.map((feature) => (
                      <li key={feature}>
                        <CheckCircle2 size={16} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={ctaHref}
                    className={card.highlight ? styles.pricingCtaPrimary : styles.pricingCta}
                  >
                    {card.cta}
                    <ArrowRight size={16} />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>

        <div className={styles.pricingNote}>
          {pricingOverview?.billingDisabled
            ? "当前处于订阅关闭模式，页面仅展示方案结构。"
            : "开通后可直接进入对应模块，支付方式会根据可用配置自动选择。"}
        </div>
      </section>

      <footer className={styles.footer}>
        <div id="questions" className={styles.footerQuestionArea}>
          <div className={styles.footerQuestionHeader}>
            <span>FAQ</span>
            <Link href="/faq">常见业务问题</Link>
            <p>当客户开始用 AI 找方案，市场团队需要知道自己有没有被推荐。</p>
          </div>
          <Link href="/faq" className={styles.footerFaqCta}>
            查看 FAQ
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className={styles.brand}>
          <span className={styles.brandMark}>智</span>
          <span>
            <strong>智链</strong>
            <small>GeniLink</small>
          </span>
        </div>
        <div className={styles.footerLinks}>
          <Link href="/support">帮助支持</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/blog">知识文章</Link>
          <Link href="/terms">服务条款</Link>
          <Link href="/privacy">隐私政策</Link>
          <a href="mailto:support@genilink.cn">
            <Mail size={13} />
            联系我们
          </a>
        </div>
      </footer>
    </main>
  );
}

function AnimatedConsole({
  active,
}: {
  active: (typeof productModules)[number];
}) {
  return (
    <div className={styles.heroScene} aria-label="智链分析工作台预览">
      <div className={styles.sceneTopbar}>
        <span>智链可见性分析控制台</span>
        <div>
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className={styles.scorePanel}>
        <div className={styles.scoreRing}>
          <span>{active.metric}</span>
          <small>{active.metricLabel}</small>
        </div>
        <div className={styles.scoreText}>
          <span className={styles.statusBadge}>{active.label}</span>
          <h2>{active.title}</h2>
          <p>{active.body}</p>
        </div>
      </div>
      <div className={styles.platformGrid}>
        {active.rows.map(([name, value], index) => (
          <div key={name} className={styles.platformCell}>
            <span>{name}</span>
            <div>
              <b style={{ width: `${Math.min(90, 46 + index * 14)}%` }} />
            </div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductShot({
  active,
}: {
  active: (typeof productModules)[number];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    setMediaError(false);
  }, [active.video]);

  useEffect(() => {
    if (mediaError) return;
    const video = videoRef.current;
    if (!video) return;

    function isFullyVisible(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

      return rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewportHeight && rect.right <= viewportWidth;
    }

    function syncPlayback() {
      if (isFullyVisible(video)) {
        void video.play().catch(() => {
          // Keep the poster visible if the browser blocks autoplay.
        });
      } else {
        video.pause();
      }
    }

    const observer = new IntersectionObserver(syncPlayback, {
      root: null,
      threshold: [0, 0.5, 0.9, 1],
    });

    observer.observe(video);
    syncPlayback();
    const intervalId = window.setInterval(syncPlayback, 250);
    window.addEventListener("scroll", syncPlayback, { passive: true });
    window.addEventListener("resize", syncPlayback);
    window.addEventListener("orientationchange", syncPlayback);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
      window.removeEventListener("scroll", syncPlayback);
      window.removeEventListener("resize", syncPlayback);
      window.removeEventListener("orientationchange", syncPlayback);
      video.pause();
    };
  }, [active.video, mediaError]);

  return (
    <div className={styles.productShot} aria-label={`${active.label}界面预览`}>
      <div className={styles.productShotTop}>
        <span>{active.label}</span>
        <small>真实产品界面</small>
      </div>
      <div className={styles.productMedia}>
        {mediaError ? (
          <img className={styles.productFallbackImage} src={active.image} alt={`${active.label}功能页面截图`} />
        ) : (
          <video
            ref={videoRef}
            className={styles.productVideo}
            poster={active.image}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={`${active.label}功能页面动态演示`}
            onError={() => setMediaError(true)}
          >
            <source src={active.video} type="video/webm" />
          </video>
        )}
      </div>
    </div>
  );
}
