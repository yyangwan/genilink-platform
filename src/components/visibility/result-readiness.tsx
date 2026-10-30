"use client";

import type { ResultReadiness as Readiness } from '@/types/intelligence';
import styles from './result-readiness.module.css';

const labels = { ready: '已就绪', partial: '部分可用', pending: '待处理', blocked: '需要处理', not_applicable: '本次不适用' };

export function ResultReadiness({ readiness, onRemedy }: { readiness?: Readiness; onRemedy: (remedy: NonNullable<Readiness>['items'][number]['remedy']) => void }) {
  return <section className={`citation-panel citation-pad ${styles.panel}`} aria-labelledby="result-readiness-title">
    <div className="citation-section-head"><div><h2 id="result-readiness-title">本次结果可以判断什么？</h2><p className="citation-muted">采集、分析、身份、问题与来源分别核对</p></div></div>
    {!readiness ? <p role="status">结果就绪条件尚未取得，暂不推断品牌缺席。</p> : <div className={styles.grid}>{readiness.items.map(item => <article key={item.key} className={styles.item}>
      <div className={styles.heading}><h3>{item.title}</h3><span data-state={item.state}>{labels[item.state]}</span></div>
      <strong>{item.total === null ? item.completed ? `${item.completed} 条待核对` : '尚无可用记录' : `${item.completed} / ${item.total}`}</strong>
      <p>{item.detail}</p><button type="button" onClick={() => onRemedy(item.remedy)}>{item.remedy.label} →</button>
    </article>)}</div>}
  </section>;
}
