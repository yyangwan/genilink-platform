'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type WorkspaceChoice = { id: string; name: string; projects: Array<{ id: string; name: string }> };

export function FullDiagnosisForm({ reportId, workspaces }: { reportId: string; workspaces: WorkspaceChoice[] }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? '');
  const [projectId, setProjectId] = useState(workspaces[0]?.projects[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [needsSubscription, setNeedsSubscription] = useState(false);
  const workspace = workspaces.find((item) => item.id === workspaceId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setNeedsSubscription(false);
    const selection = !workspaceId ? { mode: 'personal' }
      : projectId ? { mode: 'existing', workspaceId, projectId }
        : { mode: 'create', workspaceId };
    try {
      const response = await fetch(`/api/quick-checks/${encodeURIComponent(reportId)}/full-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
      });
      const result = await response.json();
      if (response.status === 202) setMessage('诊断启动请求已提交。稍后再次点击可查看处理进度。');
      else if (response.ok) router.push('/website-analysis');
      else if (result.code === 'NO_SUBSCRIPTION') {
        setMessage(result.error);
        setNeedsSubscription(true);
      }
      else setMessage(result.error || '暂时无法开始诊断，请稍后重试。');
    } catch {
      setMessage('暂时无法开始诊断，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="quick-checks__panel" aria-labelledby="full-diagnosis">
      <h2 className="quick-checks__panel-title" id="full-diagnosis">做完整官网诊断</h2>
      <form onSubmit={submit} className="quick-checks__form">
        {workspace ? (
          <div className="quick-checks__fields quick-checks__fields--two">
            <div className="quick-checks__field">
              <label htmlFor="diagnosis-workspace">工作区</label>
              <select id="diagnosis-workspace" value={workspaceId} onChange={(event) => {
                const next = workspaces.find((item) => item.id === event.target.value);
                setWorkspaceId(event.target.value);
                setProjectId(next?.projects[0]?.id ?? '');
              }}>
                {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="quick-checks__field">
              <label htmlFor="diagnosis-project">项目</label>
              <select id="diagnosis-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                <option value="">为该官网创建项目</option>
              </select>
            </div>
          </div>
        ) : <p className="quick-checks__muted">开始诊断时会创建个人工作区和该官网的项目。</p>}
        <div className="quick-checks__actions">
          <button className="dashboard-button dashboard-button--primary" type="submit" disabled={pending}>{pending ? '正在提交…' : '确认并开始诊断'}</button>
          {needsSubscription && <Link className="quick-checks__link" href="/upgrade?module=visibility">查看订阅方案</Link>}
        </div>
        {message && <p role="status" className="quick-checks__feedback">{message}</p>}
      </form>
    </section>
  );
}
