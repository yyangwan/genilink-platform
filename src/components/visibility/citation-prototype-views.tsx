"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AiPlatformLabel } from "@/components/ui/ai-platform-label";
import { getAiPlatformLabel } from "@/lib/ai-platforms";
import { EvidenceComparisons } from "./evidence-comparisons";
import type { EvidenceRun } from "@/types/intelligence";

export const citationViews = [
  { id: "overview", title: "审计洞察", heading: "把可见性结果变成下一步行动", eyebrow: "AUDIT INSIGHT", subtitle: "按真实审计结果定位优先事项，逐平台核对来源与证据。" },
  { id: "platforms", title: "平台差异对照", heading: "同一个问题，分别看清各平台", eyebrow: "PLATFORM COMPARISON", subtitle: "回答、引用来源和建议分别比较，保留每个平台的采集条件。" },
  { id: "entities", title: "品牌发现对比", heading: "从全部内容中发现品牌与机会", eyebrow: "ENTITY DISCOVERY", subtitle: "包括尚未登记的观察主体，身份须经确认。" },
  { id: "sources", title: "来源文章库", heading: "来源文章库", eyebrow: "SOURCE LIBRARY", subtitle: "按文章回查各平台引用与正文归档状态。" },
  { id: "evidence", title: "观点与证据", heading: "逐个观点核对原文证据", eyebrow: "CLAIM EVIDENCE", subtitle: "把回答观点与保存的来源段落放在一起核对。" },
  { id: "actions", title: "优化行动", heading: "每条优化建议，都有证据和验收目标", eyebrow: "ACTION PLAN", subtitle: "从平台诊断形成有证据的执行任务。" },
  { id: "drafts", title: "内容创作方案", heading: "把证据转为可执行的内容方案", eyebrow: "CONTENT BRIEF", subtitle: "用已确认的事实和证据准备内容材料。" },
  { id: "measurements", title: "行动效果复测", heading: "行动完成之后，逐平台验证变化", eyebrow: "MEASUREMENT", subtitle: "固定同题样本，逐平台观察变化。" },
] as const;

export type CitationViewId = typeof citationViews[number]["id"];

export function CitationViewNav({ value, onChange }: { value: string; onChange: (view: CitationViewId) => void }) {
  return <nav className="citation-view-nav" aria-label="审计分析步骤">
    {citationViews.map((view, index) => <button key={view.id} type="button" aria-current={value === view.id ? "page" : undefined}
      onClick={() => onChange(view.id)}><span>{String(index + 1).padStart(2, "0")}</span>{view.title}</button>)}
  </nav>;
}

function Stat({ title, value, detail, tone }: { title: string; value: string | number; detail: string; tone?: string }) {
  return <div className="citation-panel citation-stat"><span className="citation-muted">{title}</span>
    <strong className={tone || ""}>{value}</strong><small>{detail}</small></div>;
}

export function CitationOverview({ run, onView }: { run: EvidenceRun; onView: (view: CitationViewId) => void }) {
  const coverage = run.coverage;
  const analyzed = coverage.analyzed_characters || 0;
  const total = coverage.total_characters || 0;
  const diagnoses = (run.summary.diagnoses || []).filter(item => item.action && item.record_id);
  const platforms = run.summary.platforms || [];
  const analyzedResponses = platforms.reduce((sum, item) => sum + item.analyzed_responses, 0);
  const own = (run.summary.entities || []).filter(item => item.role === "own");
  const newlyFound = (run.summary.entities || []).filter(item => item.role === "unregistered");
  const gaps = [
    { title: "核对文本分析失败", detail: "已分析字符 " + analyzed + " / " + total + "；在恢复分析前不能判断品牌缺席。", view: "evidence" as CitationViewId },
    { title: "补齐可取得的来源正文", detail: String(coverage.captured_sources || 0) + " / " + String(coverage.sources || 0) + " 条来源已存正文；未取得的部分保持未知。", view: "sources" as CitationViewId },
    { title: "复核各平台的采集差异", detail: String(coverage.responses || 0) + " 份回答已入库；失败或不完整样本不计为表现下降。", view: "platforms" as CitationViewId },
  ];
  const priorities = analyzed > 0 && diagnoses.length
    ? diagnoses.slice(0, 3).map(item => ({ title: item.action!.task, detail: item.platform + " · " + item.finding, view: "actions" as CitationViewId }))
    : gaps;

  return <div className="citation-stack">
    <div className="citation-stat-grid">
      <Stat title="已取得平台回答" value={coverage.responses || 0} detail={String(coverage.failed_responses || 0) + " 份失败样本单列"} />
      <Stat title="我方品牌回答提及" value={analyzedResponses && own.length === 1 ? String(own[0].response_count) + " / " + String(analyzedResponses) : "待核对"}
        detail={analyzedResponses && own.length === 1 ? "仅限已分析的有效回答" : "分析或品牌身份未就绪"} tone="citation-teal" />
      <Stat title="已保存来源正文" value={String(coverage.captured_sources || 0) + " / " + String(coverage.sources || 0)}
        detail="正文保存不等于全文完整" tone="citation-purple" />
      <Stat title="新发现实体" value={analyzed ? newlyFound.length : "待分析"}
        detail={analyzed ? "未登记主体仍须确认身份" : "不能据此断言没有其他品牌"} />
    </div>
    <div className="citation-notice">{analyzed
      ? "基础结果已可回查，来源正文与人工复核的覆盖范围请逐项核对。"
      : "回答与部分正文已经保存，但当前分析没有产生可用文本结论。先处理数据缺口，不生成品牌优化判断。"}
      <button onClick={() => onView("sources")}>查看采集覆盖 →</button></div>
    <div className="citation-split">
      <section className="citation-panel citation-pad">
        <div className="citation-section-head"><h2>{analyzed && diagnoses.length ? "本期最值得处理的 3 件事" : "当前最需要处理的 3 项数据缺口"}</h2>
          <span className="citation-tag">按证据可用性排序</span></div>
        {priorities.map((item, index) => <div className="citation-priority" key={item.title}>
          <span className="citation-priority-number">{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{item.title}</h3><p>{item.detail}</p></div>
          <button onClick={() => onView(item.view)}>查看 →</button>
        </div>)}
      </section>
      <section className="citation-panel citation-pad">
        <div className="citation-section-head"><h2>每个平台的问题不同</h2><button onClick={() => onView("platforms")}>展开对照 →</button></div>
        {platforms.map(item => {
          const finding = item.analyzed_responses > 0
            ? (run.summary.diagnoses || []).find(diagnosis => diagnosis.platform === item.platform)?.finding : undefined;
          return <div className="citation-platform-summary" key={item.platform}>
            <div><AiPlatformLabel platform={item.platform} iconSize={17} /><span>{finding || "待核对分析结论"}</span></div>
            <div className="citation-mini-bar"><span style={{ width: item.responses ? String(Math.round(item.analyzed_responses / item.responses * 100)) + "%" : "0%" }} /></div>
            <small>{item.analyzed_responses} / {item.responses} 份回答完成分析 · {item.snapshot_count} 份正文快照</small>
          </div>;
        })}
        {!platforms.length && <p className="citation-muted">尚无分平台结果，先核对回答采集。</p>}
        <p className="citation-inspect">各平台结果分别诊断和复测；一次观察不能说明平台有固定偏好。</p>
      </section>
    </div>
    <section className="citation-panel citation-pad">
      <div className="citation-section-head"><h2>从发现到验证</h2><span className="citation-muted">每一步保留证据与状态</span></div>
      <div className="citation-flow">{[
        ["entities", "发现新品牌", "核对观察主体的项目身份"],
        ["evidence", "核对回答与原文", "区分支持、冲突和未知"],
        ["drafts", "执行内容改进", "使用已确认事实与材料"],
        ["measurements", "查看平台效果", "分别观察上升、持平和下降"],
      ].map(([view, title, detail], index) => <button key={view} onClick={() => onView(view as CitationViewId)}>
        <span>0{index + 1}</span><strong>{title}</strong><small>{detail}</small>
      </button>)}</div>
    </section>
  </div>;
}

export function PlatformComparison({ run, onOpenAnswer, onView }: {
  run: EvidenceRun; onOpenAnswer: (id: string) => void; onView: (view: CitationViewId) => void;
}) {
  const prompts = useMemo(() => Array.from(new Map(run.responses.map(item => [item.prompt_hash || item.prompt, item.prompt])).entries()), [run.responses]);
  const [selected, setSelected] = useState(prompts[0]?.[0] || "");
  const responses = run.responses.filter(item => (item.prompt_hash || item.prompt) === selected);
  const platformNames = Array.from(new Set(responses.map(item => item.platform)));
  return <div className="citation-stack">
    <section className="citation-panel citation-pad">
      <div className="citation-section-head"><h2>同一提示词</h2><span className="citation-tag">按真实采样分别呈现</span></div>
      <select aria-label="对照提示词" className="citation-select" value={selected} onChange={event => setSelected(event.target.value)}>
        {prompts.map(([hash, prompt]) => <option key={hash} value={hash}>{prompt}</option>)}
      </select>
      {!prompts.length && <p className="citation-muted">本次审计没有可对照的回答。</p>}
    </section>
    <div className="citation-comparison-grid">
      {platformNames.map(platform => {
        const samples = responses.filter(item => item.platform === platform);
        const sources = run.sources.filter(item => samples.some(sample => sample.id === item.response_id));
        const diagnosis = (run.summary.platforms || []).some(item => item.platform === platform && item.analyzed_responses > 0)
          ? (run.summary.diagnoses || []).find(item => item.platform === platform && (!item.prompt || samples.some(sample => sample.prompt === item.prompt))) : undefined;
        const claim = (run.summary.claims || []).find(item => samples.some(sample => sample.id === item.owner_id));
        return <section className="citation-panel citation-platform-card" key={platform}>
          <div className="citation-platform-card-head"><AiPlatformLabel platform={platform} iconSize={20} />
            <small>{samples.length} 次独立回答</small></div>
          <div className="citation-platform-card-body">
            <span className="citation-tag">{diagnosis ? "待复核诊断" : "暂无可用诊断"}</span>
            <h3>回答中的观察</h3>
            <p className="citation-answer-snippet">{claim?.quote || "当前没有可核验的回答观点。可打开已采集的原始回答核对。"}</p>
            <h3>平台展示的来源</h3>
            <ul>{sources.slice(0, 3).map(source => <li key={source.id}>{source.title || "未取得标题"}<small> · {source.fetch_status === "captured" ? "正文已存" : "正文未知"}</small></li>)}</ul>
            {!sources.length && <p className="citation-muted">未取得可确认的来源卡片。</p>}
            <div className="citation-hypothesis"><strong>针对该平台的待验证方向</strong>
              <p>{diagnosis?.action?.task || diagnosis?.finding || "分析或来源证据尚未就绪，不能推断品牌缺口。"}</p></div>
            <div className="citation-inline-actions">
              {samples[0] && <button onClick={() => onOpenAnswer(samples[0].id)}>查看原始回答 →</button>}
              <button onClick={() => onView("evidence")}>查看原文证据 →</button>
            </div>
          </div>
        </section>;
      })}
    </div>
    {!!platformNames.length && <p className="citation-notice citation-notice--warning">本页是同题观察。采集条件不完整、回答失败和正文缺失均单列，不能把差异归因为平台固定偏好。</p>}
  </div>;
}

type Source = EvidenceRun["sources"][number];
type SourceGroup = { key: string; entries: Source[]; representative: Source };

export function SourceLibrary({ run, onOpenAnswer, onOpenSource, onRetry, retrying }: {
  run: EvidenceRun; onOpenAnswer: (id: string) => void; onOpenSource: (id: string, title: string) => void;
  onRetry: (id: string) => void; retrying: string | null;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [platform, setPlatform] = useState("");
  const groups = useMemo(() => {
    const map = new Map<string, SourceGroup>();
    for (const source of run.sources) {
      const key = source.document_id || source.url || source.id;
      const group = map.get(key);
      if (group) group.entries.push(source);
      else map.set(key, { key, entries: [source], representative: source });
    }
    return Array.from(map.values());
  }, [run.sources]);
  const filtered = groups.filter(group => {
    const hasText = (group.representative.title + " " + (group.representative.url || "")).toLowerCase().includes(query.toLowerCase());
    const statusMatch = status === "all" || (status === "captured"
      ? group.entries.some(item => item.snapshot_id)
      : status === "blocked"
        ? group.entries.some(item => item.fetch_status === "blocked") && !group.entries.some(item => item.snapshot_id)
        : !group.entries.some(item => item.snapshot_id) && !group.entries.some(item => item.fetch_status === "blocked"));
    return hasText && statusMatch &&
      (!platform || group.entries.some(item => item.platform === platform));
  });
  const captured = groups.filter(group => group.entries.some(item => item.snapshot_id)).length;
  const blocked = groups.filter(group => !group.entries.some(item => item.snapshot_id) && group.entries.some(item => item.fetch_status === "blocked")).length;
  const pending = groups.filter(group => !group.entries.some(item => item.snapshot_id) && !group.entries.some(item => item.fetch_status === "blocked")).length;
  const statusChoices = [
    ["all", "全部文章"], ["captured", "正文已保存"], ["blocked", "访问受限"], ["pending", "待处理"],
  ];
  return <div className="citation-stack">
    <section className="citation-panel citation-pad">
      <div className="citation-section-head"><h2>原文采集覆盖</h2><span className="citation-muted">{groups.length} 篇可辨认文章 · 正文已保存 {captured} 篇</span></div>
      <div className="citation-coverage-track">
        <span style={{ width: groups.length ? captured / groups.length * 100 + "%" : "0%" }} />
        <span style={{ width: groups.length ? blocked / groups.length * 100 + "%" : "0%" }} />
        <span style={{ width: groups.length ? pending / groups.length * 100 + "%" : "0%" }} />
      </div>
      <div className="citation-coverage-legend"><span>● 正文已保存 {captured}</span><span>● 访问受限 {blocked}</span><span>● 待处理 {pending}</span>
        <small>按文档或精确 URL 归并；正文已保存不代表全文完整。</small></div>
    </section>
    <section className="citation-panel citation-pad">
      <div className="citation-tabs" role="tablist" aria-label="来源正文状态">{statusChoices.map(([value, title]) =>
        <button key={value} type="button" role="tab" aria-selected={status === value} onClick={() => setStatus(value)}>{title}</button>)}</div>
      <div className="citation-filter-row">
        <input aria-label="搜索来源文章" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题或地址" />
        <select aria-label="来源平台" value={platform} onChange={event => setPlatform(event.target.value)}>
          <option value="">全部平台</option>
          {Array.from(new Set(run.sources.map(item => item.platform))).map(name => <option key={name} value={name}>{getAiPlatformLabel(name)}</option>)}
        </select>
        <span className="citation-muted">{run.sources.length} 条引用或候选观察</span>
      </div>
      <div className="overflow-x-auto"><table className="citation-table citation-source-table"><thead><tr>
        <th>文章 / 来源</th><th>平台与引用类型</th><th>正文状态</th><th>关联证据</th>
      </tr></thead><tbody>
        {filtered.map(group => {
          const visibleEntries = platform ? group.entries.filter(item => item.platform === platform) : group.entries;
          const source = visibleEntries[0] || group.representative;
          const snapshot = group.entries.find(item => item.snapshot_id);
          const platforms = Array.from(new Set(visibleEntries.map(item => item.platform)));
          return <tr key={group.key} className="citation-source-entry">
            <td><strong>{source.title || "未取得来源标题"}</strong><small>{source.url || "未取得精确地址"}</small>
              <small>{source.snippet || "摘要未取得"}</small></td>
            <td>{platforms.map(name => <div key={name}><AiPlatformLabel platform={name} iconSize={15} /></div>)}
              <small>{visibleEntries.some(item => item.kind === "answer_reference") ? "回答实际引用" : "候选或推测来源"} · {visibleEntries.length} 条观察</small></td>
            <td><span className="citation-tag">{snapshot ? "正文已保存" : source.fetch_status === "blocked" ? "访问受限" : "正文未就绪"}</span></td>
            <td><div className="citation-source-actions">
              <button onClick={() => onOpenAnswer(source.response_id)}>关联回答</button>
              {snapshot && <button onClick={() => onOpenSource(snapshot.snapshot_id!, source.title || "保存正文")}>查看正文</button>}
              {!snapshot && source.document_id && <button disabled={!!retrying} onClick={() => onRetry(source.document_id!)}>重试采集</button>}
            </div></td>
          </tr>;
        })}</tbody></table></div>
        {!filtered.length && <p className="citation-empty">当前筛选没有来源。请调整条件；未知正文不能当作文章没有提及品牌。</p>}
      <p className="citation-muted">回答实际引用、搜索候选与推测来源分别标记；候选不能计入实际引用。</p>
    </section>
    <div className="citation-three-up">{[
      ["文章级版本", "保存正文与抓取时间形成版本；历史回答继续关联当时记录。"],
      ["转载与独立证据", "相似文章不因标题相近强制合并；同一地址的多次引用保持独立观察。"],
      ["来源类型区分", "回答引用与检索候选分别呈现，避免把候选计为真实引用。"],
    ].map(([title, detail]) => <div className="citation-panel citation-pad" key={title}><h3>{title}</h3><p className="citation-muted">{detail}</p></div>)}</div>
  </div>;
}

export function EntityComparison({ run, onReview }: { run: EvidenceRun; onReview: () => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "focus">("all");
  const [role, setRole] = useState("");
  const entities = run.summary.entities || [];
  const candidates = entities.filter(item => item.role === "unregistered" || item.identity_status !== "confirmed");
  const sourceOnly = entities.filter(item => item.response_count === 0 && item.source_mentions > 0);
  const responseCount = run.summary.platforms?.reduce((sum, item) => sum + item.analyzed_responses, 0) || 0;
  const filtered = entities.filter(item => (scope === "all" || ["own", "competitor"].includes(item.role)) &&
    (!role || item.role === role) && item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const primaryCandidate = candidates.find(item => item.response_count > 0) || candidates[0];
  return <div className="citation-stack">
    <div className="citation-stat-grid">
      <Stat title="回答内品牌 / 相关实体" value={entities.filter(item => item.response_count > 0).length} detail="已分析回答中的观察主体" />
      <Stat title="候选待确认" value={candidates.length} detail="不自动归入竞品名单" tone="citation-purple" />
      <Stat title="仅来源文章中发现" value={sourceOnly.length} detail="不加入回答提及分母" />
      <Stat title="无品牌回答" value="待核对" detail="须按有效回答及实体归属核验" />
    </div>
    <section className="citation-panel citation-pad">
      <div className="citation-tabs" role="tablist" aria-label="实体范围">
        <button type="button" role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")}>全部发现实体 · {entities.length}</button>
        <button type="button" role="tab" aria-selected={scope === "focus"} onClick={() => setScope("focus")}>重点品牌 · {entities.filter(item => ["own", "competitor"].includes(item.role)).length}</button>
      </div>
      <div className="citation-filter-row">
        <input aria-label="搜索品牌或实体" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索品牌、产品或机构" />
        <select aria-label="筛选实体身份" value={role} onChange={event => setRole(event.target.value)}>
          <option value="">全部身份</option><option value="own">自有品牌</option><option value="competitor">已登记竞品</option>
          <option value="unregistered">未登记主体</option><option value="comparison">仅用于比较</option>
        </select>
        <span className="citation-muted">比较队列：{responseCount ? responseCount + " 份已分析回答" : "有效回答待确认"}</span>
      </div>
      <div className="overflow-x-auto"><table className="citation-table"><thead><tr>
        <th>品牌 / 实体</th><th>项目身份</th><th>回答内出现</th><th>来源提及</th><th>各平台回答提及</th>
      </tr></thead><tbody>{filtered.map(entity => <tr key={entity.id}>
        <td><strong>{entity.name}</strong><small>{entity.identity_status === "confirmed" ? "已确认" : entity.role_conflict ? "角色冲突" : "待确认"}</small></td>
        <td><span className="citation-tag">{entity.role === "own" ? "自有品牌" : entity.role === "competitor" ? "已登记竞品" : entity.role === "comparison" ? "仅用于比较" : "候选主体"}</span></td>
        <td>{entity.response_count}{responseCount ? " / " + responseCount : ""}</td><td>{entity.source_mentions}</td>
        <td>{Object.entries(entity.platform_response_counts).map(([name, count]) => <span key={name} className="citation-platform-count"><AiPlatformLabel platform={name} iconSize={14} /> {count}</span>)}</td>
      </tr>)}</tbody></table></div>
      {!filtered.length && <p className="citation-empty">当前条件下没有观察实体；未分析内容不能按零处理。</p>}
      <p className="citation-muted">同一回答可提及多个主体，因此各品牌计数不能相加作为回答总数；来源提及与回答提及独立统计。</p>
    </section>
    <div className="citation-split">
      <section className="citation-panel citation-pad">
        <div className="citation-section-head"><h2>{primaryCandidate ? primaryCandidate.name + " · 待核对的新主体" : "待确认主体"}</h2><span className="citation-tag">人工确认</span></div>
        <p className="citation-muted">{primaryCandidate ? "已在 " + primaryCandidate.response_count + " 份回答、" + primaryCandidate.source_mentions + " 条来源提及中观察到；项目身份仍需人工确认。" : "当前没有待确认主体；后续新采集与分析修订可能发现更多。"}</p>
        {primaryCandidate && <button className="citation-link" onClick={onReview}>查看证据并确认身份 →</button>}
      </section>
      <section className="citation-panel citation-pad">
        <div className="citation-section-head"><h2>未提及品牌的回答也有分析价值</h2></div>
        <p className="citation-muted">只有完成文本分析、确认实体归属和有效分母后，才统计“无品牌回答”；可进一步比较适用场景、筛选标准与信息缺口。</p>
        <p className="citation-inspect">当前已分析 {responseCount} 份平台回答。对无法确认主体或未分析的回答，保持“未知”。</p>
      </section>
    </div>
  </div>;
}

export function EvidenceWorkspace({ run, projectId, onSaved, onSourceOpen, onView }: {
  run: EvidenceRun; projectId: string; onSaved: () => void; onSourceOpen: (id: string) => void;
  onView: (view: CitationViewId) => void;
}) {
  const [platform, setPlatform] = useState("");
  const items = run.summary.claim_evidence || [];
  const platforms = Array.from(new Set(items.map(item => item.platform)));
  const visible = items.filter(item => !platform || item.platform === platform);
  const selected = visible[0];
  const reviewed = selected ? run.claim_reviews?.[selected.id] : null;
  return <div className="citation-stack">
    <div className="citation-tabs" role="tablist" aria-label="证据平台">
      <button type="button" role="tab" aria-selected={!platform} onClick={() => setPlatform("")}>全部平台</button>
      {platforms.map(name => <button type="button" role="tab" aria-selected={platform === name} key={name}
        onClick={() => setPlatform(name)}><AiPlatformLabel platform={name} iconSize={14} /></button>)}
    </div>
    <div className="citation-section-head"><h2>逐个观点核对原文证据</h2>
      <button onClick={() => onView("actions")}>关联优化行动 →</button></div>
    <EvidenceComparisons items={visible} run={run} projectId={projectId} onSaved={onSaved} onSourceOpen={onSourceOpen} />
    {!visible.length && <p className="citation-panel citation-empty">当前平台尚无可配对的回答观点与来源片段。可先在来源文章库回查已保存正文。</p>}
    {!!visible.length && <>
      <p className="citation-notice citation-notice--warning">来源正文的抓取时间可能晚于回答；原文支持关系不能证明模型采纳了该段内容。最终结论以人工复核记录为准。</p>
      <div className="citation-three-up">
        <section className="citation-panel citation-pad"><h3>已观察到的文本</h3><p className="citation-muted">{selected.answer_quote || "回答观点尚未取得"}</p></section>
        <section className="citation-panel citation-pad"><h3>支持关系</h3><p className="citation-muted">{reviewed
          ? "人工复核：" + ({ supports: "支持", partial: "部分支持", contradicts: "冲突", unverified: "无法核验" }[reviewed.relation] || "待核对")
          : "模型初判待人工复核；不可直接作为已批准事实。"}</p></section>
        <section className="citation-panel citation-pad"><h3>尚缺信息</h3><p className="citation-muted">{selected.source_quote
          ? "仍需核对原文版本、主体范围与适用条件。" : "没有取得可核验的来源片段，不能推断原文支持。"}
        </p></section>
      </div>
    </>}
  </div>;
}

export function ActionIntro({ run, onView }: { run: EvidenceRun; onView: (view: CitationViewId) => void }) {
  const [platform, setPlatform] = useState("");
  const analyzed = (run.coverage.analyzed_characters || 0) > 0;
  const actions = analyzed ? (run.summary.diagnoses || []).filter(item => item.action && item.record_id) : [];
  const platforms = Array.from(new Set(actions.map(item => item.platform)));
  const filtered = actions.filter(item => !platform || item.platform === platform);
  return <div className="citation-stack">
    <div className="citation-stat-grid">
      <Stat title="待复核行动" value={actions.length} detail="按证据、场景与工作量排序" />
      <Stat title="平台专项" value={platforms.length} detail="逐平台保留独立目标" tone="citation-purple" />
      <Stat title="已有证据索引" value={actions.filter(item => item.evidence_ids?.length).length} detail="仍需人工核对原文" tone="citation-teal" />
      <Stat title="材料待核对" value={actions.filter(item => item.action?.materials_needed.length).length} detail="完成核实后再审批" />
    </div>
    <section className="citation-panel citation-pad">
      <div className="citation-tabs" role="tablist" aria-label="行动平台">
        <button role="tab" aria-selected={!platform} onClick={() => setPlatform("")}>全部行动 · {actions.length}</button>
        {platforms.map(name => <button key={name} role="tab" aria-selected={platform === name} onClick={() => setPlatform(name)}><AiPlatformLabel platform={name} iconSize={14} /></button>)}
      </div>
      {filtered.map((item, index) => <article className="citation-action-card" key={item.record_id || String(index)}>
        <div className="citation-action-card-head"><span className="citation-tag"><AiPlatformLabel platform={item.platform} iconSize={14} /></span>
          <small>行动 {String(index + 1).padStart(2, "0")} · 待人工复核</small></div>
        <h3>{item.action!.task}</h3><p>{item.finding}</p>
        <div className="citation-action-meta"><span>提示词：{item.prompt || "当前平台观察"}</span><span>{item.sample_count ?? "未知"} 次独立样本</span>
          <button onClick={() => onView("evidence")}>查看证据 →</button></div>
        <details><summary>修改对象、所需材料与复测目标</summary>
          <div className="citation-action-details"><p><strong>所需材料</strong>{item.action!.materials_needed.join("；") || "待确认"}</p>
            <p><strong>验收方式</strong>{item.action!.success_check || "待确定"}</p>
            <p><strong>执行前提</strong>先核对回答、来源原文、品牌事实与适用边界。</p></div>
        </details>
      </article>)}
      {!actions.length && <p className="citation-empty">当前没有可依据的品牌优化行动。先核对分析覆盖和来源证据，再形成平台专项建议。</p>}
    </section>
    <p className="citation-notice citation-notice--warning">平台证据冲突或材料不足时，先创建核实任务；计划审批不等于事实审批或内容发布。</p>
  </div>;
}

export function WorkflowIntro({ kind, projectId }: { kind: "drafts" | "measurements"; projectId: string }) {
  return <section className="citation-panel citation-pad">
    <div className="citation-section-head"><h2>{kind === "drafts" ? "从行动到内容" : "从发布到验证"}</h2>
      <span className="citation-tag">保留平台目标与证据</span></div>
    <div className="citation-flow">{(kind === "drafts" ? [
      ["01", "选择已批准行动", "计划审批不等于事实或发布审批"],
      ["02", "核对事实与材料", "引用片段、限制和版本可追溯"],
      ["03", "进入内容工作台", "生成后仍需审核及发布登记"],
    ] : [
      ["01", "冻结基线", "固定提示词、平台和采样轮次"],
      ["02", "记录发布资产", "保留 URL、版本与发布时间"],
      ["03", "逐平台复测", "分别观察改善、持平或退步"],
    ]).map(([number, title, detail]) => <div key={number}><span>{number}</span><strong>{title}</strong><small>{detail}</small></div>)}</div>
    {kind === "drafts" && <Link className="citation-link" href={"/content?project=" + encodeURIComponent(projectId)}>前往内容工作台 →</Link>}
  </section>;
}

export function DraftEvidenceSummary({ run }: { run: EvidenceRun }) {
  const diagnosis = (run.summary.diagnoses || []).find(item => item.action && item.record_id);
  const savedSources = run.sources.filter(item => item.snapshot_id).length;
  return <div className="citation-stack">
    <section className="citation-panel citation-pad">
      <div className="citation-section-head"><h2>可关联的证据包</h2><span className="citation-tag">仍须人工核实</span></div>
      <div className="citation-evidence-list">
        <p><strong>平台诊断</strong><span>{diagnosis ? <><AiPlatformLabel platform={diagnosis.platform} iconSize={14} /> · {diagnosis.finding}</> : "尚无可执行诊断"}</span></p>
        <p><strong>来源正文</strong><span>{savedSources} 条来源观察已有保存正文；需核对版本与适用范围</span></p>
        <p><strong>品牌事实</strong><span>仅使用已单独审批且仍有效的事实材料</span></p>
      </div>
    </section>
    <section className="citation-panel citation-pad">
      <div className="citation-section-head"><h2>平台目标分别验证</h2></div>
      {diagnosis ? <p className="citation-muted"><AiPlatformLabel platform={diagnosis.platform} iconSize={14} /> · {diagnosis.action?.success_check || "复测目标待核对"}</p>
        : <p className="citation-muted">当前未形成可用的平台专项行动。内容方案不能先于证据和事实审批。</p>}
      <p className="citation-inspect">建立草稿与发布页面不等于可见性改善；发布后仍需固定样本复测。</p>
    </section>
  </div>;
}

export function MeasurementBaseline({ run }: { run: EvidenceRun }) {
  const platforms = run.summary.platforms || [];
  return <div className="citation-stack">
    <div className="citation-comparison-grid">
      {platforms.map(item => <section className="citation-panel citation-platform-card" key={item.platform}>
        <div className="citation-platform-card-head"><AiPlatformLabel platform={item.platform} iconSize={19} /><small>本审计基线</small></div>
        <div className="citation-platform-card-body">
          <strong className="citation-measure-count">{item.analyzed_responses} / {item.responses}</strong>
          <p className="citation-muted">回答完成分析</p>
          <p>{item.snapshot_count} 份来源正文快照 · {item.source_observations} 条来源观察</p>
          <span className="citation-tag">等待共同有效样本复测</span>
        </div>
      </section>)}
    </div>
    {!platforms.length && <p className="citation-panel citation-empty">尚无分平台基线，先完成本次审计分析。</p>}
    <p className="citation-notice citation-notice--warning">上方只展示本审计基线，不是改善幅度。复测须固定提示词、平台、采样轮次和分析口径；不同平台分别判断。</p>
  </div>;
}
