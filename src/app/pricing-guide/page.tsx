import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gauge,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import { SUBSCRIPTION_TIERS } from '@/lib/billing/tiers';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: '套餐权益说明 - 智链',
  description: '详细了解智链入门版、专业版和高级版的功能范围、额度计算、报告等级与订阅规则。',
};

const levelRows = [
  {
    feature: '审计报告',
    basic: '展示总分、平台表现和最多 3 条核心洞察，不展示品牌及提示词明细。',
    full: '展示完整洞察、品牌表现、提示词结果和平台明细。',
    advanced: '包含完整报告能力，并提供更高的审计与 PDF 导出额度，适合多项目规模化复盘。',
  },
  {
    feature: '优化建议',
    basic: '每次最多展示 3 条优先建议。',
    full: '每次最多展示 10 条建议，覆盖更完整的改进方向。',
    advanced: '不限制单次返回的建议数量，实际数量取决于审计发现。',
  },
  {
    feature: '内容洞察',
    basic: '展示情感分布和最多 5 个主要主题。',
    full: '增加完整主题、引用来源和 AI 回答结构分析。',
    advanced: '包含完整洞察能力，并配合更高审计、项目与历史数据额度。',
  },
  {
    feature: '战略智能',
    basic: '开放来源权威、结构演化和竞品定位等核心战略分析。',
    full: '当前分析维度与基础版一致，主要结合 24 个月历史、更多项目和更高对比额度服务规模化运营。',
    advanced: '战略智能当前使用“完整版”表述，不单独设置高级版结果层级。',
  },
  {
    feature: '内容日历',
    basic: '支持基本排期和日历查看，受每月排期条数限制。',
    full: '使用相同日历工作流，并提供更高排期额度和更完整的平台配置。',
    advanced: '内容日历当前不单独设置高级版，Max 通过 500 条/月额度支持规模化排期。',
  },
  {
    feature: '平台配置',
    basic: '支持手动创建、修改和删除发布平台配置。',
    full: '增加 OAuth 授权回调和访问令牌刷新能力。',
    advanced: '平台配置当前不单独设置高级版。',
  },
];

const usageRules = [
  ['网站分析', '成功创建一次网站分析任务计 1 次；失败创建不扣额度。'],
  ['AI 可见性审计', '成功创建一次审计任务计 1 次，审计覆盖的平台数量不重复计次。'],
  ['PDF 报告导出', '成功生成并下载一份审计或网站分析 PDF 计 1 次。'],
  ['内容创作', '标准内容生成、Genie 创作及从优化建议生成内容简报均计入内容创作额度。'],
  ['内容优化与 SEO 优化', '两项额度独立计算；调用成功后分别扣减对应额度。'],
  ['内容质量评分', '每完成一次 AI 质量评估计 1 次，查看已有评分不重复计次。'],
  ['排期内容数', '每成功新增一条内容排期计 1 条；查看或删除排期不重复扣减。'],
  ['多审计对比', '每成功执行一组审计对比计 1 组。'],
];

const featureGroups = [
  {
    title: '团队与项目容量',
    body: '项目数决定可管理的独立业务或网站数量；成员数决定工作区可邀请人数；主品牌和竞品分别计算。每个项目最多维护 10 个 AI 监测提示词，各套餐一致。',
  },
  {
    title: '智见：分析与审计',
    body: '网站分析关注官网结构、语义和 AI 可读性；AI 可见性审计关注品牌在不同 AI 平台回答中的提及、推荐和引用表现。趋势历史、报告深度、建议数量和对比能力随套餐升级。',
  },
  {
    title: '战略智能',
    body: '来源权威趋势用于观察 AI 答案引用了哪些来源；结构演化分析用于比较回答结构随时间的变化；竞品定位分析用于理解自有品牌与竞品在提及频率和位置上的差异。入门版暂不开放这些能力。',
  },
  {
    title: '智创：内容生产',
    body: '内容创作、优化、SEO 优化和质量评分分别计量。内容日历用于把选题推进到排期；品牌声音控制表达风格；内容模板用于沉淀可复用的创作结构。',
  },
  {
    title: '开放接口与系统集成',
    body: '当前所有套餐均未开放公开 API。高级版显示“暂未开放”，表示该能力在产品规划中，但当前订阅不包含可直接调用的开放接口，也不会因此额外收费。',
  },
];

export default function PricingGuidePage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/#pricing" className={styles.backLink}>
          <ArrowLeft size={16} />
          返回套餐方案
        </Link>

        <header className={styles.hero}>
          <span>PRICING GUIDE</span>
          <h1>套餐权益，应该清楚到不需要猜</h1>
          <p>这份说明用于解释套餐矩阵中的功能名称、等级差异、额度计算和订阅边界。最终可用权益以账户内套餐状态和套餐矩阵为准。</p>
          <nav className={styles.quickNav} aria-label="页面目录">
            <a href="#positioning">版本定位</a>
            <a href="#levels">等级区别</a>
            <a href="#usage">额度规则</a>
            <a href="#features">功能解释</a>
            <a href="#billing">订阅规则</a>
          </nav>
        </header>

        <section id="positioning" className={styles.section}>
          <div className={styles.sectionHeading}>
            <Layers3 size={20} />
            <div><span>01</span><h2>三个版本如何选择</h2></div>
          </div>
          <div className={styles.tierGrid}>
            {SUBSCRIPTION_TIERS.map((tier) => (
              <article key={tier.key} className={tier.recommended ? styles.tierFeatured : styles.tierCard}>
                <span>{tier.eyebrow}</span>
                <h3>{tier.name}</h3>
                <p>{tier.audience}</p>
                <strong>{tier.key === 'lite' ? '验证阶段' : tier.key === 'pro' ? '持续增长' : '规模化运营'}</strong>
                <ul>
                  {tier.features.slice(0, 3).map((feature) => <li key={feature}><CheckCircle2 size={15} />{feature}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="levels" className={styles.section}>
          <div className={styles.sectionHeading}>
            <Gauge size={20} />
            <div><span>02</span><h2>基础版、完整版和高级版差在哪里</h2></div>
          </div>
          <p className={styles.sectionIntro}>等级描述可能表示结果深度，也可能表示与该套餐配套的历史范围和使用额度。以下按当前实际能力解释，不代表尚未上线的未来功能。</p>
          <div className={styles.levelTable}>
            <div className={styles.levelHeader}><strong>功能</strong><strong>基础</strong><strong>完整</strong><strong>高级 / Max</strong></div>
            {levelRows.map((row) => (
              <div key={row.feature} className={styles.levelRow}>
                <strong>{row.feature}</strong><p>{row.basic}</p><p>{row.full}</p><p>{row.advanced}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="usage" className={styles.section}>
          <div className={styles.sectionHeading}>
            <Clock3 size={20} />
            <div><span>03</span><h2>每月额度如何计算</h2></div>
          </div>
          <div className={styles.notice}>“每月”表示按自然月统计。只有成功创建或完成对应操作时才记录用量；单纯查看已有数据通常不会重复扣减。</div>
          <div className={styles.ruleList}>
            {usageRules.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section id="features" className={styles.section}>
          <div className={styles.sectionHeading}>
            <ShieldCheck size={20} />
            <div><span>04</span><h2>功能范围与边界</h2></div>
          </div>
          <div className={styles.featureList}>
            {featureGroups.map((group) => <article key={group.title}><h3>{group.title}</h3><p>{group.body}</p></article>)}
          </div>
        </section>

        <section id="billing" className={styles.section}>
          <div className={styles.sectionHeading}>
            <CheckCircle2 size={20} />
            <div><span>05</span><h2>订阅、升级与支付规则</h2></div>
          </div>
          <div className={styles.billingGrid}>
            <article><h3>月付与年付</h3><p>月付和年付的功能权益相同，区别在价格和订阅周期。年付不会额外减少月度功能额度。</p></article>
            <article><h3>套餐升级</h3><p>平台当前支持向上升级。升级后使用更高套餐的项目容量、功能等级和月度额度。</p></article>
            <article><h3>支付方式</h3><p>已配置的套餐支持微信支付和支付宝。支付完成并确认后，系统会自动更新工作区订阅权益。</p></article>
            <article><h3>额度用尽</h3><p>达到额度后，对应新增或生成操作会暂停，并提示套餐限制；已有项目、报告和内容仍可按权限查看。</p></article>
          </div>
        </section>

        <section className={styles.cta}>
          <div><span>还有疑问？</span><h2>先看完整矩阵，再选择适合当前阶段的版本</h2></div>
          <div>
            <Link href="/#pricing">查看套餐矩阵 <ArrowRight size={16} /></Link>
            <Link href="/faq" className={styles.secondaryLink}>阅读常见问题</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
