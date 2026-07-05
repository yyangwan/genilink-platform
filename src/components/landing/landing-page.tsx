"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
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
  TrendingUp,
} from "lucide-react";

import { blogArticles } from "@/lib/marketing-content";

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

const questions = [
  "AI 回答里为什么没有我的品牌？",
  "我的官网是否容易被大模型理解和引用？",
  "竞品为什么更常出现在推荐结果里？",
  "内容团队下一步应该优先写什么？",
  "从洞察到内容生成和排期，怎么串成流程？",
];

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

  const encodedUrl = useMemo(() => encodeURIComponent(normalizeUrl(url)), [url]);
  const registerHref = encodedUrl
    ? `/auth/register?source=website-diagnosis&targetUrl=${encodedUrl}`
    : "/auth/register?source=website-diagnosis";
  const loginHref = encodedUrl
    ? `/auth/login?callbackUrl=${encodeURIComponent(`/website-analysis?targetUrl=${encodedUrl}`)}`
    : "/auth/login";

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
          <a href="#questions">常见问题</a>
          <a href="#blog">知识文章</a>
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
            让你的官网成为<span className={styles.nowrap}>AI答案</span>里的可信来源
          </h1>
          <p className={styles.lede}>
            智链把官网诊断、AI 可见性审计、竞品分析、内容洞察、智创内容生成和内容日历放在同一个工作台。
            先看清品牌为什么没有被推荐，再明确该改哪一页、补哪类内容、跟进哪些竞品。
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
                  className={styles.moduleTab}
                  href={`#module-${item.id}`}
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

      <section id="questions" className={styles.questionBand}>
        <div className={styles.sectionHeader}>
          <span>常见业务问题</span>
          <h2>当客户开始用 AI 找方案，市场团队需要知道自己有没有被推荐</h2>
        </div>
        <div className={styles.questionGrid}>
          {questions.map((question) => (
            <div key={question} className={styles.questionItem}>
              <CheckCircle2 size={18} />
              <span>{question}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="blog" className={styles.blogBand}>
        <div className={styles.sectionHeader}>
          <span>知识普及</span>
          <h2>帮助客户理解 AI 搜索、GEO 和内容增长的新规则</h2>
          <p>
            这些文章围绕平台能力展开，解释官网为什么需要被 AI 理解、内容如何提升可引用性，以及如何用竞品分析找到增长机会。
          </p>
        </div>
        <div className={styles.blogGrid}>
          {blogArticles.map((article) => (
            <Link key={article.slug} href={`/blog/${article.slug}`} className={styles.blogCard}>
              <span>
                <BookOpen size={15} />
                {article.category}
              </span>
              <h3>{article.title}</h3>
              <p>{article.excerpt}</p>
              <small>
                {article.readTime}
                <ArrowRight size={14} />
              </small>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <span>
            <TrendingUp size={16} />
            从官网诊断开始
          </span>
          <h2>输入官网，先看清你的品牌在 AI 搜索里的基础短板</h2>
        </div>
        <Link href={registerHref} className={styles.primaryButton}>
          免费诊断官网
          <ArrowRight size={16} />
        </Link>
      </section>

      <footer className={styles.footer}>
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
        <span>GeniLink Visibility Console</span>
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
  return (
    <div className={styles.productShot} aria-label={`${active.label}界面预览`}>
      <div className={styles.productShotTop}>
        <span>{active.label}</span>
        <small>real product screen</small>
      </div>
      <div className={styles.productMedia}>
        <video
          className={styles.productVideo}
          poster={active.image}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={`${active.label}功能页面动态演示`}
        >
          <source src={active.video} type="video/webm" />
        </video>
      </div>
    </div>
  );
}
