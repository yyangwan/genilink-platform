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
    <form onSubmit={submit} className="dashboard-surface space-y-4 p-5">
      <h2 className="text-lg font-semibold">做完整官网诊断</h2>
      {workspace ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">工作区
            <select className="input-base" value={workspaceId} onChange={(event) => {
              const next = workspaces.find((item) => item.id === event.target.value);
              setWorkspaceId(event.target.value);
              setProjectId(next?.projects[0]?.id ?? '');
            }}>
              {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1">项目
            <select className="input-base" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              <option value="">为该官网创建项目</option>
            </select>
          </label>
        </div>
      ) : <p>开始诊断时会创建个人工作区和该官网的项目。</p>}
      <button className="btn-primary" type="submit" disabled={pending}>{pending ? '正在提交…' : '确认并开始诊断'}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
      {needsSubscription && <Link className="underline" href="/upgrade?module=visibility">查看订阅方案</Link>}
    </form>
  );
}
