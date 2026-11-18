"use client";

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useProject } from '@/components/project/project-context';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import { CaptureControls } from '@/components/visibility/capture-controls';
import { CaptureRecords } from '@/components/visibility/capture-records-v4';
import { CaptureSummary } from '@/components/visibility/audit-v4-status';
import { useAuditCapture } from '@/components/visibility/use-audit-v4';
import { intelligenceUrl } from '@/lib/visibility/analysis-scope';
import { captureHref, isAuditId, isRecordId } from '@/lib/visibility/v4-audit';
import '@/components/visibility/visibility-collection.css';
import '@/components/visibility/audit-v4.css';

function ProjectVisibility({ projectId }: { projectId: string }) {
  const dashboard = useVisibilityDashboard(projectId, 'collection');
  const search = useSearchParams(), router = useRouter();
  const [createdAudit, setCreatedAudit] = useState('');
  const scoped = search.get('project') === projectId;
  const queryAudit = scoped ? search.get('auditId') : null;
  const auditId = isAuditId(queryAudit) ? queryAudit : createdAudit || dashboard.data?.latest_audit?.id || '';
  const { data: capture, loading, error, refetch } = useAuditCapture(projectId, auditId);
  const selectedRecord = scoped && queryAudit === auditId ? search.get('sampleId') : null;
  const snapshotId = search.get('snapshotId'), ordinal = search.get('ordinal');
  const requestedSource = selectedRecord && isRecordId(snapshotId) && ordinal && /^[1-9][0-9]{0,2}$/.test(ordinal) && Number(ordinal) <= 200
    ? { ordinal: Number(ordinal), snapshot_id: snapshotId } : undefined;

  const track = (id: string) => {
    setCreatedAudit(id);
    router.replace(captureHref(projectId, id), { scroll: false });
    dashboard.refetch();
  };
  const insightHref = intelligenceUrl(search.toString(), projectId, {
    auditId: auditId || null, view: 'overview', runId: capture?.published_run_id || null,
  });
  const active = capture?.capture?.state === 'collecting' || capture?.archive?.state === 'archiving'
    || capture?.status === 'running' || capture?.status === 'pending';
  const taskState = active ? 'running' : auditId && !capture ? 'checking' : 'idle';
  return <div className="audit-workspace citation-workspace visibility-collection audit-v4">
    <header className="citation-page-head"><div><span>VISIBILITY COLLECTION</span><h1>可见性分析</h1>
      <p>发起一次采集，核对每个平台的原始结果。</p></div>
      <div className="citation-page-actions">
        <Link className="dashboard-button dashboard-button--secondary" href={'/audits?project=' + encodeURIComponent(projectId)}>历史审计</Link>
      </div>
    </header>
    {dashboard.loading && !dashboard.data && <p role="status">正在读取当前项目的审计…</p>}
    {dashboard.locked && <p className="v4-warn" role="alert">当前项目权限或订阅不支持查看可见性报告。</p>}
    {dashboard.error && <p className="v4-warn" role="alert">项目概览暂不可用。 <button className="v4-link" type="button" onClick={dashboard.refetch}>重新查询</button></p>}
    {dashboard.data?.can_capture
      ? <div id="visibility-capture-settings"><CaptureControls projectId={projectId} enabled={dashboard.data.enabled}
        activeAuditId={auditId} taskState={taskState} onCreated={track} confirmStart />
        <div className="visibility-collection__manage"><Link className="v4-link" href={'/settings/prompts?project=' + encodeURIComponent(projectId)}>管理提示词 ↗</Link></div>
      </div>
      : dashboard.data && <p className="v4-note">发起采集需要完整分析和项目写入权限，品牌配置同步后即可使用。</p>}
    {loading && !capture && <p role="status">正在读取采集状态…</p>}
    {error && <p className="v4-warn" role="alert">{error} <button className="v4-link" type="button" onClick={refetch}>重新查询状态</button></p>}
    {capture?.mode === 'v4' && <CaptureSummary data={capture} insightHref={insightHref} />}
    {auditId && capture && <CaptureRecords key={auditId} projectId={projectId} auditId={auditId} version={capture}
      selectedRecord={isRecordId(selectedRecord) ? selectedRecord : null} requestedSource={requestedSource}
      onRecord={id => router.replace(captureHref(projectId, auditId, id || undefined), { scroll: false })} />}
    {!auditId && dashboard.data && <section className="citation-panel v4-panel"><h2>采集进度</h2><p className="v4-note">当前项目暂无采集记录。</p></section>}
  </div>;
}
function VisibilityRoot() {
  const { currentProjectId, projects, loading, openWizard } = useProject();
  if (loading) return <p>正在加载项目…</p>;
  return currentProjectId ? <ProjectVisibility key={currentProjectId} projectId={currentProjectId} /> : <><PageHeader title="可见性分析" /><ProjectSetupState hasProjects={projects.length > 0} featureName="可见性分析" onCreateProject={openWizard} /></>;
}
export default function VisibilityPage() { return <Suspense fallback={<p>正在加载可见性分析…</p>}><VisibilityRoot /></Suspense>; }
