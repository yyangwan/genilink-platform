"use client";

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSectionFetch, type SectionFetchState } from '@/components/dashboard/use-section-fetch';
import { LoadingSkeleton } from '@/components/dashboard/widgets';
import { PageHeader } from '@/components/ui/page-header';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import { TabBar } from '@/components/ui/tab-bar';
import { getAiPlatformMeta } from '@/lib/ai-platforms';
import { formatDateInTimeZone } from '@/lib/time';
import { intelligenceUrl } from '@/lib/visibility/analysis-scope';
import { SCENARIOS, type Scenario } from '@/lib/visibility/scenarios';
import { captureHref, type AuditCaptureSummary, type AuditScoreReport, type VisibilityRecommendation } from '@/lib/visibility/v4-audit';
import type { ContentSummary } from '@/types/dashboard';
import './workbench.css';

interface PublishedReport extends AuditScoreReport {
  finished_at: string | null;
}

interface WorkbenchAudit {
  project_id: string;
  latest_audit_id: string | null;
  capture: AuditCaptureSummary | null;
  report: PublishedReport | null;
}

interface ExecutionCounts {
  project_id: string;
  not_started: number;
  in_progress: number;
  awaiting_review: number;
  completed: number;
  cancelled: number;
  total: number;
}

type Destination = (view: string, options?: Record<string, string | null>) => string;
type Tone = 'normal' | 'good' | 'warn';
type RecentContent = Pick<ContentSummary, 'recentContent'>;

const PLATFORM_ORDER = ['deepseek', 'doubao', 'kimi', 'hunyuan', 'qwen'];
const ANALYSIS_LABEL: Record<string, string> = {
  waiting_for_capture: '等待采集完成', waiting_for_archive: '等待正文归档', queued: '等待分析',
  running: '分析中', failed: '分析失败', completed: '分析已完成', skipped: '未启动分析',
};
const SCORE_DIMENSIONS: Record<string, string> = {
  presence: '品牌出现', recommendation: '推荐强度', position: '推荐位置', reasons: '推荐理由',
};
const NO_SCORE: Record<string, string> = {
  no_verified_samples: '本次没有可核验的计分样本。',
  no_eligible_questions: '本次没有可计分的问题。',
  own_brand_not_configured: '本次审计未配置自有品牌。',
};
const CONTENT_STATUS: Record<string, string> = {
  draft: '草稿', generating: '生成中', review: '审核中', approved: '已审核',
  scheduled: '已排期', publishing: '发布中', published: '已发布',
  failed: '发布失败', archived: '已归档', processing: '处理中',
};
const CONTENT_PLATFORM: Record<string, string> = {
  website: '官网', wechat: '微信', weibo: '微博', douyin: '抖音', xiaohongshu: '小红书',
  toutiao: '头条', zhihu: '知乎', generic: '通用内容',
};
const PLATFORM_TABS = [{ id: 'score', label: '品牌表现' }, { id: 'capture', label: '采集情况' }];
const EXECUTION_STATS = [
  ['not_started', '未开始'], ['in_progress', '进行中'], ['awaiting_review', '待验收'], ['completed', '已完成'],
] as const;

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="workbench-link" href={href}>{children}<span aria-hidden="true">↗</span></Link>;
}

function Badge({ children, tone = 'normal' }: { children: ReactNode; tone?: Tone }) {
  return <span className="workbench-badge" data-tone={tone}>{children}</span>;
}

function Card({ title, subtitle, controls, children }: {
  title: string; subtitle?: string; controls?: ReactNode; children: ReactNode;
}) {
  return <section className="dashboard-surface workbench-card" aria-label={title}>
    <header className="workbench-card-head">
      <div><h2>{title}</h2>{subtitle && <p className="workbench-note">{subtitle}</p>}</div>
      {controls}
    </header>
    {children}
  </section>;
}

function Notice({ children, retry, busy = false }: { children: ReactNode; retry?: () => void; busy?: boolean }) {
  return <div className="workbench-notice" role={retry ? 'status' : undefined}>
    <p>{children}</p>{retry && <button type="button" className="workbench-link" onClick={retry} disabled={busy}>重新读取</button>}
  </div>;
}

function Loading() {
  return <div className="workbench-body" role="status" aria-label="正在读取"><LoadingSkeleton rows={2} /></div>;
}

function ResourceNotice({ state, unavailable }: {
  state: SectionFetchState<unknown>; unavailable: string;
}) {
  if (state.loading) return <Loading />;
  if (state.locked) return <Notice>当前订阅或项目权限不支持查看。 <TextLink href="/settings/billing">查看订阅</TextLink></Notice>;
  return <Notice retry={state.refetch}>{unavailable}</Notice>;
}

function Track({ value, tone = 'own' }: { value: number | null; tone?: 'own' | 'other' }) {
  return <span className="workbench-track" data-tone={tone} aria-hidden="true">
    {value !== null && <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />}
  </span>;
}

function ScoreCard({ report, state, capture, onDetails }: {
  report: PublishedReport | null; state: SectionFetchState<WorkbenchAudit>;
  capture: AuditCaptureSummary | null; onDetails: () => void;
}) {
  const score = report?.score;
  const coverage = score?.coverage;
  const comparison = report?.comparison;
  const own = report?.targets.find(target => target.target_id === report.own_target_id);
  const other = report?.targets.find(target => target.target_id === comparison?.target_id);
  const hasScore = score?.value != null;
  const partial = !!coverage && coverage.scored < coverage.planned;
  const pairOwn = comparison?.own?.value ?? null;
  const pairOther = comparison?.other?.value ?? null;
  const hasPair = pairOwn !== null && pairOther !== null;
  const commonCount = comparison?.common_sample_count ?? 0;
  const aligned = hasPair && commonCount === coverage?.scored && comparison?.own_only_count === 0;
  const widest = comparison?.own?.coverage?.platforms.reduce<{ platform: string; gap: number } | null>((best, row) => {
    const match = comparison?.other?.coverage?.platforms.find(item => item.platform === row.platform);
    if (!row.scored || row.value === null || match?.value == null) return best;
    const gap = Math.abs(row.value - match.value);
    return !gap || (best && best.gap >= gap) ? best : { platform: row.platform, gap };
  }, null);

  return <Card title="品牌可见性" controls={hasScore && <Badge tone={partial ? 'warn' : 'good'}>{partial ? '基于部分样本' : '分析已完成'}</Badge>}>
    {!report && (state.loading || state.error || state.locked)
      ? <ResourceNotice state={state} unavailable="评分数据暂不可用。" />
      : !report ? <Notice>{capture?.capture?.state === 'failed' ? '本次采集未取得回答，未评分。'
        : capture?.analysis?.state === 'completed' ? '本次分析暂无可用评分。'
        : capture?.analysis ? ANALYSIS_LABEL[capture.analysis.state] || '等待审计结果。'
        : '尚无已发布的评分。完成采集与分析后可在此查看。'}</Notice>
      : <>
        {hasScore ? <div className="workbench-score-body">
          <div>
            <p className="workbench-note">自有品牌{own && ` · ${own.name}`}</p>
            <p className="workbench-score">{score.value} <small>/ 100</small></p>
            {coverage && <p className="workbench-note">{coverage.scored} / {coverage.planned} 个计分样本 · {coverage.scored_platforms} / {coverage.planned_platforms} 个平台</p>}
          </div>
          <div className="workbench-score-side">
            <p className="workbench-note">对比品牌{other && ` · ${other.name}`}</p>
            {hasPair ? <>
              <p className="workbench-comparison">{pairOther} <small>分</small></p>
              <p className="workbench-note">共同样本 {commonCount} 份{!aligned && ` · 自有品牌 ${pairOwn} 分`}</p>
              <p className="workbench-note">共同样本相差 {Math.abs(pairOwn - pairOther)} 分</p>
            </> : <p className="workbench-note">{other ? '暂无共同可评分样本' : '暂无可比品牌'}</p>}
          </div>
        </div> : <Notice>{NO_SCORE[score?.no_score_reason || ''] || '本次暂无可用评分。'}</Notice>}
        {widest && <div className="workbench-insight"><span>平台重点</span><strong>{getAiPlatformMeta(widest.platform).label} 同样本差距最大，相差 {widest.gap} 分</strong></div>}
        <footer className="workbench-foot">
          <p className="workbench-note">{hasPair ? (aligned ? '评分覆盖与双方比较范围一致' : '主分与共同样本比较使用各自的样本范围') : '按实际可评分样本统计'}</p>
          <button type="button" className="workbench-link" onClick={onDetails}>评分依据 <span aria-hidden="true">↗</span></button>
        </footer>
      </>}
  </Card>;
}

function PriorityCard({ report, state, destination, onDetails }: {
  report: PublishedReport | null; state: SectionFetchState<WorkbenchAudit>;
  destination: Destination; onDetails: (item: VisibilityRecommendation) => void;
}) {
  const items = report?.recommendations ?? [];
  return <Card title="优先行动" subtitle="按差距与证据排序" controls={<TextLink href={destination('actions')}>查看全部</TextLink>}>
    {!report && (state.loading || state.error || state.locked) ? <ResourceNotice state={state} unavailable="优化建议暂不可用。" /> :
      items.length ? <ol className="workbench-list">{items.slice(0, 3).map((item, index) => <li className="workbench-item workbench-priority" key={item.id}>
        <span className="workbench-rank" aria-hidden="true">{index + 1}</span>
        <div className="workbench-item-copy">
          <p className="workbench-item-meta"><AiPlatformLabel platform={item.platform} iconSize={16} />
            <span>{SCENARIOS[item.scenario as Scenario] || '未归类'}</span></p>
          <h3 title={item.title}>{item.title}</h3>
          <p className="workbench-note workbench-clamp">{item.deliverable}</p>
          <div className="workbench-item-meta">
            <Badge tone={item.source_support.length ? 'good' : 'normal'}>{item.source_support.length ? '有引用正文支持' : '依据来自回答'}</Badge>
            <button type="button" className="workbench-link" onClick={() => onDetails(item)}>看依据 <span aria-hidden="true">↗</span></button>
            {item.action_id && <TextLink href={destination('actions', { actionId: item.action_id, opportunity: item.action_opportunity?.id || null, platform: item.platform, scenario: item.action_opportunity?.scenario || null })}>打开行动</TextLink>}
          </div>
        </div>
      </li>)}</ol> : <Notice>{report ? '当前报告暂无达到证据要求的优先建议。' : '评分发布后显示有证据支持的优化建议。'}</Notice>}
  </Card>;
}

function PlatformCard({ report, capture, state, destination, collectHref }: {
  report: PublishedReport | null; capture: AuditCaptureSummary | null;
  state: SectionFetchState<WorkbenchAudit>; destination: Destination; collectHref: string;
}) {
  const [tab, setTab] = useState('score');
  const showingCapture = tab === 'capture';
  const comparison = report?.comparison;
  const pairedOwn = comparison?.own?.coverage?.platforms ?? [];
  const pairedOther = comparison?.other?.coverage?.platforms ?? [];
  const hasComparison = !!comparison?.other && !!comparison.own;
  const ownName = report?.targets.find(item => item.target_id === report.own_target_id)?.name || '自有品牌';
  const otherName = report?.targets.find(item => item.target_id === comparison?.target_id)?.name || '对比品牌';
  return <Card title="平台表现" controls={<TabBar tabs={PLATFORM_TABS} activeTab={tab} onTabChange={setTab} />}>
    <div role="tabpanel" aria-label={showingCapture ? '采集情况' : '品牌表现'}>
      {!state.data && (state.loading || state.error || state.locked) ? <ResourceNotice state={state} unavailable="平台数据暂不可用。" /> :
        showingCapture && !capture ? <Notice>当前没有可查看的采集记录。</Notice> :
        !showingCapture && !report ? <Notice>评分发布后显示各平台的品牌表现。</Notice> :
        <div className="workbench-body">
          {!showingCapture && <div className="workbench-legend"><span>{ownName}</span>{hasComparison && <span>{otherName}</span>}</div>}
          {PLATFORM_ORDER.map(platform => {
            const count = capture?.platforms?.find(item => item.platform === platform);
            const overall = report?.score.coverage?.platforms.find(item => item.platform === platform);
            const a = (hasComparison ? pairedOwn.find(item => item.platform === platform) : overall);
            const b = pairedOther.find(item => item.platform === platform);
            const label = getAiPlatformMeta(platform).label;
            const countText = count ? `${count.received} / ${count.planned} 份 · ${count.failed} 失败${count.pending ? ` · ${count.pending} 待完成` : ''}` : '未计划采集';
            const scoreText = a?.value == null ? (overall?.scored ? '暂无共同样本' : '未取得计分样本')
              : hasComparison ? `${a.value} / ${b?.value ?? '—'} 分 · 共同样本 ${a.scored} 份` : `${a.value} 分 · ${a.scored} / ${a.planned} 份`;
            return <div className="workbench-platform-row" key={platform}>
              <AiPlatformLabel platform={platform} />
              <div className="workbench-platform-data">
                {showingCapture ? <Track value={count?.planned ? count.received / count.planned * 100 : null} /> :
                  <><Track value={a?.value ?? null} />{hasComparison && <Track tone="other" value={b?.value ?? null} />}</>}
                <p className="workbench-note">{showingCapture ? countText : scoreText}</p>
              </div>
              {showingCapture ? count && <TextLink href={collectHref}>采集记录</TextLink>
                : overall?.scored ? <Link className="workbench-link" aria-label={`查看 ${label} 分析`} href={destination('platforms', { platform })}>查看 <span aria-hidden="true">↗</span></Link> : null}
            </div>;
          })}
        </div>}
    </div>
    <footer className="workbench-foot">
      <p className="workbench-note">{showingCapture ? `采集审计${capture ? ` #${capture.audit_id}` : ''} · 实际入库回答`
        : hasComparison ? '每个平台按双方共同样本比较' : '各平台使用实际可评分样本'}</p>
      <TextLink href={showingCapture ? collectHref : destination('platforms')}>{showingCapture ? '查看采集' : '完整平台对照'}</TextLink>
    </footer>
  </Card>;
}

function IssuesCard({ audit, state, destination, collectHref, latestInsight }: {
  audit: WorkbenchAudit | null; state: SectionFetchState<WorkbenchAudit>;
  destination: Destination; collectHref: string; latestInsight: string;
}) {
  const capture = audit?.capture;
  const report = audit?.report;
  const issues: Array<{ title: string; summary: string; href: string; label: string }> = [];
  if (capture?.capture?.failed) {
    const { failed, planned, received } = capture.capture;
    issues.push({ title: '采集样本缺失', summary: `审计 #${capture.audit_id} 已入库 ${received} / ${planned} 份回答，${failed} 份未取得。`, href: collectHref, label: '核对记录' });
  }
  if (capture?.analysis?.state === 'failed') {
    const reason = capture.analysis.failure_reason === 'analysis_interrupted' ? '分析运行中断。' : '本次分析未能完成。';
    issues.push({ title: '分析失败', summary: `${reason}已保留 ${capture.capture?.received ?? 0} 份回答，可在审计洞察中处理。`, href: latestInsight, label: '查看分析状态' });
  }
  const identities = report?.targets.filter(target => ['unresolved', 'observed_name', 'source_only'].includes(target.identity_method) && target.identity_status !== 'confirmed') ?? [];
  if (identities.length) {
    const names = identities.slice(0, 3).map(item => item.name).join('、');
    issues.push({ title: '品牌身份待确认', summary: `审计 #${report?.audit_id} · ${names}${identities.length > 3 ? `等 ${identities.length} 个主体` : ''}。`, href: destination('entities'), label: '核对品牌身份' });
  }
  if (capture?.archive?.unavailable) {
    issues.push({ title: '部分来源正文不可用', summary: `审计 #${capture.audit_id} 有 ${capture.archive.unavailable} 条引用未能归档正文。`, href: collectHref, label: '查看引用记录' });
  }
  return <Card title="待处理事项" controls={issues.length > 0 && <Badge tone="warn">{issues.length} 项</Badge>}>
    {!audit && (state.loading || state.error || state.locked) ? <ResourceNotice state={state} unavailable="待处理事项暂不可用。" /> :
      issues.length ? <ul className="workbench-list">{issues.map(issue => <li className="workbench-item" key={issue.title}>
        <h3>{issue.title}</h3><p className="workbench-note">{issue.summary}</p><TextLink href={issue.href}>{issue.label}</TextLink>
      </li>)}</ul> :
        <Notice>{state.error ? '最近一次读取未发现待处理事项。' : audit?.latest_audit_id ? '暂无需要处理的事项。' : '完成首次采集后可查看待处理事项。'} <TextLink href={collectHref}>查看采集</TextLink></Notice>}
  </Card>;
}

function ExecutionCard({ state, projectId, href }: {
  state: SectionFetchState<ExecutionCounts>; projectId: string; href: string;
}) {
  const counts = state.data?.project_id === projectId ? state.data : null;
  const active = counts ? EXECUTION_STATS.reduce((sum, [key]) => sum + counts[key], 0) : 0;
  return <Card title="执行进展" subtitle="当前项目 · 全部优化行动" controls={<TextLink href={href}>查看行动</TextLink>}>
    {!counts ? <ResourceNotice state={state} unavailable="行动进度暂不可用。" /> : <>
      <dl className="workbench-stats">{EXECUTION_STATS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{counts[key]}</dd></div>)}</dl>
      <div className="workbench-body workbench-completion">
        <div className="workbench-completion-meta workbench-note"><span>{active ? `已完成 ${counts.completed} / ${active} 项` : '暂无待执行或已完成的行动'}</span>
          {counts.cancelled > 0 && <span>已取消 {counts.cancelled} 项</span>}</div>
        <Track value={active ? counts.completed / active * 100 : null} />
      </div>
    </>}
  </Card>;
}

function ContentCard({ state, projectId }: { state: SectionFetchState<RecentContent>; projectId: string }) {
  const query = new URLSearchParams({ project: projectId });
  const content = state.data;
  return <Card title="近期内容" subtitle="当前项目 · 最近更新" controls={<TextLink href={`/content/list?${query}`}>查看全部</TextLink>}>
    {!content ? <ResourceNotice state={state} unavailable="内容服务暂不可用。" /> :
      content.recentContent.length ? <ul className="workbench-list">{content.recentContent.slice(0, 2).map(item => <li className="workbench-item workbench-content-item" key={item.id}>
        <div className="workbench-item-copy">
          <TextLink href={`/content/${encodeURIComponent(item.id)}/edit?${query}`}>{item.title || '无标题'}</TextLink>
          <p className="workbench-note">{CONTENT_PLATFORM[item.platform] || item.platform || '渠道待定'} · {formatDateInTimeZone(item.updatedAt || item.createdAt, { includeTime: false })}{item.updatedAt ? '更新' : '创建'}</p>
        </div>
        <Badge tone={item.status === 'published' ? 'good' : item.status === 'failed' ? 'warn' : 'normal'}>{CONTENT_STATUS[item.status || ''] || '状态未知'}</Badge>
      </li>)}</ul> : <Notice>当前项目暂无内容。</Notice>}
  </Card>;
}

function RecommendationDetails({ item, report, projectId, destination, close }: {
  item: VisibilityRecommendation; report: PublishedReport; projectId: string; destination: Destination; close: () => void;
}) {
  const scope = item.action_opportunity;
  const actionHref = destination('actions', {
    actionId: item.action_id || null,
    opportunity: scope?.id || null, platform: scope ? item.platform : null, scenario: scope?.scenario || null,
  });
  return <ReadingDrawer title={item.title} onClose={close}>
    <div className="workbench-detail">
      <p className="workbench-item-meta"><AiPlatformLabel platform={item.platform} />{SCENARIOS[item.scenario as Scenario] || '未归类'}</p>
      <p><strong>原始问题</strong><br />{item.prompt}</p>
      <p><strong>观察到的差距</strong><br />{item.observed_reason} · {item.observed_gap_samples} / {item.common_samples_in_scope} 个共同样本</p>
      {item.evidence.map(evidence => <blockquote key={evidence.signal_id}>{evidence.quote}</blockquote>)}
      <p><strong>交付方向</strong><br />{item.deliverable}</p>
      <p><strong>复测标准</strong><br />{item.success_check}</p>
      {item.source_support.map(source => <div key={`${source.snapshot_id}:${source.ordinal}`}>
        <blockquote>{source.source_quote}</blockquote>
        {source.ordinal !== null && <TextLink href={captureHref(projectId, report.audit_id, item.sample_id, { ordinal: source.ordinal, snapshot_id: source.snapshot_id })}>核对引用正文</TextLink>}
      </div>)}
      <div className="workbench-detail-actions">
        <TextLink href={captureHref(projectId, report.audit_id, item.sample_id)}>核对原始回答</TextLink>
        <TextLink href={actionHref}>{item.action_id ? '打开已有行动' : '查看优化行动'}</TextLink>
      </div>
    </div>
  </ReadingDrawer>;
}

export function ProjectWorkbench({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const projectParams = new URLSearchParams({ projectId });
  const auditState = useSectionFetch<WorkbenchAudit>(`/api/integration/intelligence?view=workbenchAudit&${projectParams}`, { retainOnError: true });
  const executionState = useSectionFetch<ExecutionCounts>(`/api/integration/intelligence?view=workbenchExecution&${projectParams}`);
  const contentState = useSectionFetch<RecentContent>(`/api/dashboard/content?${new URLSearchParams({ project: projectId, view: 'workbench' })}`);
  const [drawer, setDrawer] = useState<{ runId: string | null; detail: 'score' | VisibilityRecommendation } | null>(null);
  const audit = auditState.data?.project_id === projectId ? auditState.data : null;
  const report = audit?.report ?? null;
  const capture = audit?.capture ?? null;
  const currentDetail = drawer?.runId === report?.run_id ? drawer?.detail : null;
  const openDetail = (detail: 'score' | VisibilityRecommendation) => {
    if (report) setDrawer({ runId: report.run_id, detail });
  };
  const latestId = audit?.latest_audit_id;
  const { refetch, loading, error } = auditState;
  const pollAfter = capture?.poll_after_ms;
  useEffect(() => {
    if (!pollAfter || loading || error) return;
    const timer = window.setTimeout(refetch, pollAfter);
    return () => window.clearTimeout(timer);
  }, [pollAfter, loading, error, refetch]);

  const destination: Destination = (view, options) => intelligenceUrl('', projectId, {
    view, auditId: report?.audit_id || latestId || null, runId: report?.run_id || null,
    ownTarget: report?.own_target_id || null, compareTarget: report?.comparison?.target_id || null, ...options,
  });
  const collectHref = captureHref(projectId, latestId || '');
  const latestInsight = intelligenceUrl('', projectId, { view: 'overview', auditId: latestId || null });
  const showPrevious = !!report && latestId && report.audit_id !== latestId;
  const captureState = capture?.capture?.state;
  const captureLabel = captureState === 'collecting' ? '回答采集中' : captureState === 'failed' ? '采集失败'
    : capture?.archive?.state === 'archiving' ? '正文归档中' : captureState ? '采集已结束' : null;
  const analysis = capture?.analysis?.state;
  const subtitle = [projectName, report ? `评分来自审计 #${report.audit_id}` : latestId ? `当前审计 #${latestId}` : null,
    report?.finished_at && `${formatDateInTimeZone(report.finished_at)} 发布`].filter(Boolean).join(' · ');

  return <div className="workbench">
    <PageHeader title="工作台" subtitle={subtitle || '当前项目的品牌表现与优化进展'} actions={<>
      <Link className="dashboard-button dashboard-button--secondary" href={collectHref}>查看采集 <span aria-hidden="true">↗</span></Link>
      <Link className="dashboard-button dashboard-button--primary" href={destination('overview')}>查看审计洞察 <span aria-hidden="true">↗</span></Link>
    </>} />
    {(captureLabel || analysis || showPrevious) && <div className="workbench-status" aria-label="最新审计状态">
      <span>{showPrevious ? '新审计' : '审计'} #{latestId}</span>
      {captureLabel && <Badge tone={captureLabel === '采集已结束' ? 'good' : 'warn'}>{captureLabel}</Badge>}
      {analysis && <Badge tone={analysis === 'completed' ? 'good' : 'warn'}>{ANALYSIS_LABEL[analysis] || '分析状态待查询'}</Badge>}
      {showPrevious && <TextLink href={latestInsight}>查看新审计</TextLink>}
    </div>}
    {auditState.error && audit && <Notice retry={auditState.refetch} busy={auditState.loading}>审计状态暂未更新。当前保留上一次读取的结果。</Notice>}
    <div className="workbench-grid">
      <ScoreCard report={report} state={auditState} capture={capture} onDetails={() => openDetail('score')} />
      <PriorityCard report={report} state={auditState} destination={destination} onDetails={openDetail} />
      <PlatformCard report={report} capture={capture} state={auditState} destination={destination} collectHref={collectHref} />
      <IssuesCard audit={audit} state={auditState} destination={destination} collectHref={collectHref} latestInsight={latestInsight} />
      <ExecutionCard state={executionState} projectId={projectId} href={intelligenceUrl('', projectId, { view: 'actions' })} />
      <ContentCard state={contentState} projectId={projectId} />
    </div>
    {currentDetail === 'score' && report && <ReadingDrawer title="评分依据" eyebrow="品牌可见性" closeLabel="关闭评分依据" onClose={() => setDrawer(null)}>
      <div className="workbench-detail">
        <p>审计 #{report.audit_id}{report.rule_version && ` · 规则 ${report.rule_version}`}</p>
        {report.score.coverage && <p>已评分 {report.score.coverage.scored} / {report.score.coverage.planned} 个计分样本。缺失样本保留在覆盖范围中，评分基于有分平台等权汇总。</p>}
        <dl>{report.score.dimensions?.map(item => <div className="workbench-detail-dimension" key={item.dimension}><dt>{SCORE_DIMENSIONS[item.dimension] || item.dimension}</dt><dd>{item.points ?? '—'} / {item.weight}</dd></div>)}</dl>
        <TextLink href={destination('overview')}>查看完整审计洞察</TextLink>
      </div>
    </ReadingDrawer>}
    {currentDetail && currentDetail !== 'score' && report && <RecommendationDetails key={currentDetail.id} item={currentDetail} report={report} projectId={projectId} destination={destination} close={() => setDrawer(null)} />}
  </div>;
}
