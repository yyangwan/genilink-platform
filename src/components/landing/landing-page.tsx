"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  CheckCircle2,
  FileSearch,
  FileText,
  Globe2,
  LineChart,
  Menu,
  Pause,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import styles from "./landing-page.module.css";
import { LandingSubscriptionPlans } from "@/components/billing/subscription-plans";
import type { SubscriptionPlanView } from "@/components/billing/subscription-plan-content";
import type { BillingCycle } from "@/types/billing";

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
    demoMode: "chart",
    demoSteps: ["扫描页面", "解析信号", "生成评分"],
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
    demoMode: "chart",
    demoSteps: ["发起提问", "检测提及", "对比平台"],
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
    demoMode: "report",
    demoSteps: ["聚合结果", "提炼发现", "生成报告"],
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
    demoMode: "content",
    demoSteps: ["识别缺口", "生成选题", "输出 brief"],
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
    demoMode: "content",
    demoSteps: ["读取品牌", "撰写初稿", "准备编辑"],
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
    demoMode: "calendar",
    demoSteps: ["整理选题", "匹配排期", "同步团队"],
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
    demoMode: "chart",
    demoSteps: ["统一问题", "计算差距", "定位机会"],
  },
];

type PricingOverview = {
  plans: SubscriptionPlanView[];
  billingDisabled: boolean;
  providerAvailability?: {
    wechatpay?: boolean;
    alipay?: boolean;
  };
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pricingOverview, setPricingOverview] = useState<PricingOverview | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [activeModuleId, setActiveModuleId] = useState(productModules[0].id);
  const [heroModuleIndex, setHeroModuleIndex] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (prefersReducedMotion.matches) return;

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        setHeroModuleIndex((index) => (index + 1) % productModules.length);
      }
    }, 4200);

    return () => window.clearInterval(intervalId);
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
        <div className={styles.navInner}>
          <BrandLockup />
          <nav className={styles.navLinks} aria-label="主导航" data-open={mobileNavOpen}>
            <a href="#product" onClick={() => setMobileNavOpen(false)}>核心功能</a>
            <a href="#pricing" onClick={() => setMobileNavOpen(false)}>订阅方案</a>
            <a href="#questions" onClick={() => setMobileNavOpen(false)}>常见问题</a>
            <Link href="/blog" onClick={() => setMobileNavOpen(false)}>知识普及</Link>
            <Link href={loginHref} className={styles.mobileLogin} onClick={() => setMobileNavOpen(false)}>
              登录平台
            </Link>
          </nav>
          <div className={styles.navActions}>
            <span className={styles.navStatus}><i />AI 搜索增长工作台</span>
            <Link href={loginHref} className={styles.ghostButton}>
              登录
            </Link>
            <Link href={registerHref} className={styles.navButton}>
              免费诊断官网
              <ArrowUpRight size={14} />
            </Link>
            <button
              type="button"
              className={styles.mobileMenuButton}
              aria-label={mobileNavOpen ? "关闭导航菜单" : "打开导航菜单"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
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

        <AnimatedConsole active={productModules[heroModuleIndex]} activeIndex={heroModuleIndex} />
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
                  onClick={() => setActiveModuleId(item.id)}
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
                <article
                  key={item.id}
                  id={`module-${item.id}`}
                  className={`${styles.moduleDetail} ${activeModuleId === item.id ? styles.moduleDetailActive : ""}`}
                >
                  <div className={styles.moduleCopy}>
                    <span>
                      <Icon size={16} />
                      {item.label}
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                  <ProductShot active={item} isActive={activeModuleId === item.id} />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pricing" className={styles.pricingBand}>
        <div className={styles.pricingMatrix}>
          <LandingSubscriptionPlans
            plans={pricingOverview?.plans ?? []}
            billingCycle={billingCycle}
            onBillingCycleChange={setBillingCycle}
            billingDisabled={pricingOverview?.billingDisabled}
            getPlanHref={(planKey) => `${registerHref}&planKey=${encodeURIComponent(planKey)}`}
          />
        </div>
        <div className={styles.pricingNote}>
          {pricingOverview?.billingDisabled
            ? "当前处于订阅关闭模式，页面仅展示方案结构。"
            : "登录后可选择微信支付或支付宝；未完成价格或收款配置的方案会保持不可点击。"}
        </div>
      </section>

      <footer id="questions" className={styles.footer}>
        <div className={styles.footerLead}>
          <BrandLockup />
          <p>让中国 B2B 品牌在 AI 答案里被理解、被引用、被选择。</p>
          <Link href={registerHref} className={styles.footerPrimaryLink}>
            开始免费诊断
            <ArrowRight size={15} />
          </Link>
        </div>
        <div className={styles.footerNav} aria-label="页脚导航">
          <div>
            <strong>平台</strong>
            <a href="#product">核心功能</a>
            <a href="#pricing">订阅方案</a>
            <Link href="/faq">常见问题</Link>
          </div>
          <div>
            <strong>资源</strong>
            <Link href="/blog">知识文章</Link>
            <Link href="/support">帮助支持</Link>
            <a href="mailto:support@genilink.cn">联系我们</a>
          </div>
          <div>
            <strong>条款</strong>
            <Link href="/terms">服务条款</Link>
            <Link href="/privacy">隐私政策</Link>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 GeniLink 智链</span>
          <span className={styles.serviceStatus}><i />平台服务正常</span>
          <span>为中国 B2B 增长团队打造</span>
        </div>
      </footer>
    </main>
  );
}

function AnimatedConsole({
  active,
  activeIndex,
}: {
  active: (typeof productModules)[number];
  activeIndex: number;
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
      <div key={active.id} className={styles.scorePanel}>
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
      <div className={styles.sceneProgress} aria-hidden="true">
        {productModules.map((item, index) => (
          <i key={item.id} data-active={index === activeIndex} />
        ))}
      </div>
    </div>
  );
}

function ProductShot({
  active,
  isActive,
}: {
  active: (typeof productModules)[number];
  isActive: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaError, setMediaError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (mediaError) return;
    const video = videoRef.current;
    if (!video) return;
    const videoElement = video;

    const observer = new IntersectionObserver(syncPlayback, {
      root: null,
      rootMargin: "120px 0px",
      threshold: [0, 0.28, 0.55],
    });

    function syncPlayback(entries: IntersectionObserverEntry[]) {
      const entry = entries[0];
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.28 && !document.hidden) {
        if (videoElement.readyState === 0) videoElement.load();
        void videoElement.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        videoElement.pause();
        setIsPlaying(false);
      }
    }

    observer.observe(videoElement);

    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [active.video, mediaError]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  return (
    <div className={styles.productShot} data-active={isActive} aria-label={`${active.label}界面预览`}>
      <div className={styles.productShotTop}>
        <span><Activity size={13} />{active.label}</span>
        <small>真实产品动态演示</small>
      </div>
      <div className={styles.productMedia}>
        {mediaError ? (
          <Image
            className={styles.productFallbackImage}
            src={active.image}
            alt={`${active.label}功能页面截图`}
            fill
            sizes="(max-width: 760px) 100vw, (max-width: 1100px) 88vw, 62vw"
          />
        ) : (
          <video
            ref={videoRef}
            className={styles.productVideo}
            poster={active.image}
            muted
            loop
            playsInline
            preload="none"
            aria-label={`${active.label}功能页面动态演示`}
            onError={() => setMediaError(true)}
          >
            <source src={active.video} type="video/webm" />
          </video>
        )}
        {!mediaError ? (
          <button
            type="button"
            className={styles.mediaControl}
            aria-label={isPlaying ? `暂停${active.label}演示` : `播放${active.label}演示`}
            aria-pressed={isPlaying}
            onClick={togglePlayback}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
        ) : null}
        <div className={styles.demoHud} data-mode={active.demoMode} aria-hidden="true">
          <div className={styles.demoHudHeader}>
            <span><i />实时处理</span>
            <strong>{active.metric}</strong>
          </div>
          <div className={styles.demoVisual}>
            <i /><i /><i /><i />
          </div>
          <div className={styles.demoSteps}>
            {active.demoSteps.map((step, index) => (
              <span key={step}><CheckCircle2 size={11} />{step}<b>{index + 1}</b></span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandLockup() {
  return (
    <Link href="/" className={styles.brand} aria-label="智链首页">
      <span className={styles.brandMark} aria-hidden="true">
        <svg viewBox="0 0 44 44" role="img">
          <path d="M12 14.5h12.5c4.2 0 7.5 3.3 7.5 7.5s-3.3 7.5-7.5 7.5H20" />
          <path d="M23.5 10.5 12 22l11.5 11.5" />
          <circle cx="12" cy="14.5" r="2.2" />
          <circle cx="12" cy="29.5" r="2.2" />
          <circle cx="32" cy="22" r="2.2" />
        </svg>
      </span>
      <span className={styles.brandType}>
        <strong>智链</strong>
        <small>GENILINK · AI SEARCH</small>
      </span>
    </Link>
  );
}
