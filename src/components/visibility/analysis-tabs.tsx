"use client";

const groups = [
  { name: '结果总览', views: [{ id: 'overview', name: '分析总览' }, { id: 'entities', name: '全部实体' }] },
  { name: '分平台比较', views: [{ id: 'platforms', name: '平台对照' }] },
  { name: '来源与证据', views: [{ id: 'sources', name: '来源文章' }, { id: 'evidence', name: '证据片段' }] },
  { name: '优化行动', views: [{ id: 'actions', name: '行动计划' }, { id: 'facts', name: '批准事实' }, { id: 'drafts', name: '内容草稿' }, { id: 'measurements', name: '固定样本复测' }] },
];

export const analysisViews = groups.flatMap(group => group.views.map(view => view.id));

export function AnalysisTabs({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const active = Math.max(0, groups.findIndex(group => group.views.some(view => view.id === value)));
  return <div className="analysis-navigation"><div className="analysis-tabs" role="tablist" aria-label="证据分析分组">{groups.map((group, index) => <button type="button" role="tab" key={group.name} id={`analysis-group-${index}`} aria-selected={active === index} aria-controls="analysis-panel" tabIndex={active === index ? 0 : -1}
    onClick={() => onChange(group.views[0].id)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % groups.length : event.key === 'ArrowLeft' ? (index + groups.length - 1) % groups.length : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); onChange(groups[next].views[0].id);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
    }}>{group.name}</button>)}</div>
    <nav className="analysis-subnav" aria-label="证据分析视图">{groups[active].views.map(view => <button type="button" key={view.id} aria-current={value === view.id ? 'page' : undefined} onClick={() => onChange(view.id)}>{view.name}</button>)}</nav>
  </div>;
}

export function analysisGroupId(value: string) { return `analysis-group-${Math.max(0, groups.findIndex(group => group.views.some(view => view.id === value)))}`; }
