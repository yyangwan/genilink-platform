import Link from 'next/link';
import type { CitationReport } from '@/types/citation-report';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { PlatformDiagnoses } from './platform-diagnoses';

export function StrategicEvidence({ report, projectId, platform, onOpen }: { report: CitationReport; projectId: string; platform: string; onOpen: (kind: string, id: string) => void }) {
  const query = new URLSearchParams({ project: projectId, auditId: report.audit_id }).toString();
  return <section className="space-y-4" aria-label="分平台战略依据">
    <div className="dashboard-surface space-y-3 p-5"><h2 className="font-semibold">先核对证据，再安排内容实验</h2><p className="text-sm">以下顺序按证据依赖组织工作，不预测投入回报。先补齐采集与身份归属，再核验回答和来源的具体差异，最后按平台安排材料与固定样本复测。</p><div className="flex flex-wrap gap-4 text-sm"><Link href={`/compare?${query}`}>比较全部观察实体</Link><Link href={`/suggestions?${query}`}>审阅建议与行动计划</Link><Link href={`/trends?project=${encodeURIComponent(projectId)}`}>查看固定样本复测</Link></div></div>
    {(report.platforms || []).filter(row => !platform || row.platform === platform).map(row => {
      const sources = (report.sources || []).filter(item => item.platform === row.platform);
      const references = sources.filter(item => item.kind === 'answer_reference');
      const proofs = (report.evidence || []).filter(item => item.platform === row.platform);
      return <article key={row.platform} className="dashboard-surface space-y-3 p-5"><h3 className="font-semibold">{getAiPlatformLabel(row.platform)} · 证据缺口与待核验事项</h3>
        <p className="text-sm">实际引用卡片 {references.length} 条 · 其中已保存正文 {references.filter(item => item.fetch_status === 'captured').length} 条 · 检索候选 {sources.filter(item => item.kind === 'search_candidate').length} 条</p>
        {row.metrics.map(metric => <p key={metric.metric} className="text-sm">{({ answer_presence: '回答', cited_card_presence: '引用卡片', cited_archive_presence: '保存正文', candidate_card_presence: '检索候选' } as Record<string, string>)[metric.metric] || metric.metric}：{metric.included.length} 次有效回答，{metric.excluded.length} 次排除；{metric.excluded.length ? '先在比较页核对排除原因，避免用未知样本判断品牌缺失。' : '当前有效范围内可查看实体分布。'}</p>)}
        {!references.length && <p className="text-sm">未取得实际引用卡片，不能据此判断平台不引用来源；先核对来源面板与引用类别。</p>}
        {references.some(item => item.fetch_status !== 'captured') && <p className="text-sm">存在尚未取得正文的实际引用，先处理来源获取与保存状态，再解释平台引用偏好。</p>}
        {!proofs.length && <p className="text-sm">尚无回答与来源的可核验配对，不能推出来源支持回答。</p>}
        {proofs.map(proof => <div key={proof.id} className="border-t border-[var(--border)] pt-3 text-sm"><p>模型判断：{({ supports: '支持', partial: '部分支持', contradicts: '冲突', unverified: '无法核验' } as Record<string, string>)[proof.relation] || '待核对'} · 人工复核：{proof.human_review ? '已有复核记录，需结合原文查看' : '尚无复核'}</p><blockquote className="mt-2 whitespace-pre-wrap">{proof.answer_quote}</blockquote><button onClick={() => onOpen('snapshot', proof.snapshot_id)} className="mt-2 text-[var(--color-primary)]">核对本条来源原文</button></div>)}
      </article>;
    })}
    <h2 className="font-semibold">分平台建议任务与验证方式</h2>
    <PlatformDiagnoses items={(report.diagnoses || []).filter(item => !platform || item.platform === platform)} onAnswerOpen={id => onOpen('answer', id)} />
    <p className="text-sm">卡片条数按来源观测计数，同一文章可在多条回答中出现，不代表独立网站数。这里不以域名、来源数量或文章观点推算权威分；内容发布与事实确认需要独立复核。</p>
  </section>;
}
