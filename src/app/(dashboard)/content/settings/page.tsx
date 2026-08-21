"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { AlertCircle, ArrowRight, Check, CircleHelp, ExternalLink, FolderKanban, KeyRound, Loader2, LockKeyhole, Plus, RefreshCw, Settings2, ShieldCheck, Unplug, UserRound, X } from "lucide-react";
import { useProject } from "@/components/project/project-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast-context";
import { PUBLISHING_PLATFORMS, type PlatformCredentialKey, type PublishingPlatformDefinition } from "@/lib/content/publishing-platforms";
import styles from "./page.module.css";

interface PlatformStatus {
  platform: string;
  connected: boolean;
  accountName?: string;
  username?: string;
  appId?: string;
  expiresAt?: string;
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
  hasAppSecret?: boolean;
}

type CredentialForm = Record<PlatformCredentialKey, string>;

const EMPTY_FORM: CredentialForm = { accountName: "", appId: "", appSecret: "", accessToken: "", refreshToken: "" };

function PlatformLogo({ platform }: { platform: PublishingPlatformDefinition }) {
  return (
    <div className={styles.platformMark} style={platform.iconBackground ? { background: platform.iconBackground } : undefined}>
      <Image className={styles.platformLogo} src={platform.iconSrc} alt={`${platform.name}官方图标`} width={28} height={28} />
    </div>
  );
}

function formatExpiry(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function PlatformDrawer({
  platform, status, accountLabel, projectName, saving, refreshing, onClose, onSave, onRefresh, onDisconnect,
}: {
  platform: PublishingPlatformDefinition;
  status?: PlatformStatus;
  accountLabel: string;
  projectName: string;
  saving: boolean;
  refreshing: boolean;
  onClose: () => void;
  onSave: (values: CredentialForm) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDisconnect: () => void;
}) {
  const [values, setValues] = useState<CredentialForm>({
    ...EMPTY_FORM,
    accountName: status?.accountName ?? status?.username ?? "",
    appId: status?.appId ?? "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const isConnected = status?.connected ?? false;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const hasCredential = values.appId.trim() || values.appSecret.trim() || values.accessToken.trim() || values.refreshToken.trim();
    if (!hasCredential) {
      setFormError(isConnected ? "如需更新配置，请至少填写一项新的平台凭证。" : "请至少填写一项平台凭证。");
      return;
    }
    setFormError(null);
    await onSave(values);
  };

  return (
    <>
      <div className={styles.drawerBackdrop} aria-hidden="true" onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="platform-drawer-title">
        <div className={styles.drawerHeader}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <PlatformLogo platform={platform} />
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <h2 id="platform-drawer-title" className="text-base font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{platform.name}配置</h2>
                  <span className={`dashboard-chip ${isConnected ? "dashboard-chip--success" : ""}`} style={!isConnected ? { color: "var(--text-muted)", background: "var(--bg-hover)" } : undefined}>{isConnected ? "已配置" : "未配置"}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>凭证保存后不会再次通过页面接口完整返回</p>
              </div>
            </div>
            <button type="button" className="dashboard-icon-button" onClick={onClose} aria-label="关闭配置面板"><X size={18} /></button>
          </div>
        </div>

        <form className="contents" onSubmit={submit}>
          <div className={styles.drawerBody}>
            <div className={`${styles.bindingNote} mb-6`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--color-primary)" }}><ShieldCheck size={14} /> 配置绑定范围</div>
              <p className="text-xs leading-5">此配置仅供账号“{accountLabel}”在项目“{projectName}”中使用。切换账号或项目后，将加载对应的独立配置。</p>
            </div>

            <details className={`${styles.guide} mb-6`} open={!isConnected}>
              <summary className={styles.guideSummary}>
                <span className="flex items-center gap-2"><CircleHelp size={15} /> 如何获取所需信息</span>
                <span className={styles.guideChevron}>⌄</span>
              </summary>
              <div className={styles.guideBody}>
                <p className="text-xs leading-5" style={{ color: "var(--text-secondary)" }}>{platform.credentialGuide.intro}</p>
                <ol className="mt-4 space-y-3">
                  {platform.credentialGuide.steps.map((step, index) => (
                    <li key={step} className="flex items-start gap-3 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
                      <span className={styles.guideStep}>{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a className="dashboard-button dashboard-button--secondary" href={platform.credentialGuide.consoleUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> {platform.credentialGuide.consoleLabel}
                  </a>
                  {platform.credentialGuide.docsUrl && (
                    <a className="dashboard-button" href={platform.credentialGuide.docsUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)", background: "transparent", border: "1px solid var(--border)" }}>
                      查看官方文档 <ArrowRight size={13} />
                    </a>
                  )}
                </div>
              </div>
            </details>

            <div className="space-y-5">
              {platform.fields.map((field) => (
                <label key={field.key} className="block">
                  <span className="dashboard-field-label">{field.label}</span>
                  <div className="relative">
                    <input
                      className="dashboard-input px-3 py-2 pr-10 text-sm"
                      type={field.secret ? "password" : "text"}
                      autoComplete="off"
                      value={values[field.key]}
                      onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={isConnected && field.secret ? "已保存；留空则不修改" : field.placeholder}
                    />
                    {field.secret && <LockKeyhole className="absolute right-3 top-1/2 -translate-y-1/2" size={14} style={{ color: "var(--text-muted)" }} />}
                  </div>
                  {field.help && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{field.help}</span>}
                </label>
              ))}
            </div>

            {formError && <div className="mt-5 flex items-start gap-2 rounded-lg p-3 text-xs" role="alert" style={{ color: "var(--color-error)", background: "color-mix(in srgb, var(--color-error) 10%, transparent)" }}><AlertCircle size={14} className="mt-0.5 shrink-0" /> {formError}</div>}

            {isConnected && (
              <div className="mt-7 border-t pt-6" style={{ borderColor: "var(--border)" }}>
                <h3 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>连接维护</h3>
                <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>刷新授权不会改变当前账号与项目的绑定关系。</p>
                <button type="button" className="dashboard-button dashboard-button--secondary" disabled={refreshing} onClick={onRefresh}>{refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 刷新授权</button>
              </div>
            )}
          </div>

          <div className={styles.drawerFooter}>
            <div>{isConnected && <button type="button" className="dashboard-button" style={{ color: "var(--color-error)", background: "transparent", paddingLeft: 0 }} onClick={onDisconnect}><Unplug size={14} /> 解除绑定</button>}</div>
            <div className="flex items-center gap-2">
              <button type="button" className="dashboard-button dashboard-button--secondary" onClick={onClose}>取消</button>
              <button type="submit" className="dashboard-button dashboard-button--primary" disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 保存配置</button>
            </div>
          </div>
        </form>
      </aside>
    </>
  );
}

export function SettingsInner() {
  const { data: session } = useSession();
  const { currentProject, currentProjectId, loading: projectLoading } = useProject();
  const { addToast } = useToast();
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const accountLabel = session?.user?.name || session?.user?.email || "当前登录账号";

  const fetchStatus = useCallback(async () => {
    if (!currentProjectId) { setPlatforms([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled(PUBLISHING_PLATFORMS.map(async (platform) => {
      const response = await fetch(`/api/platform-config/${platform.id}?projectId=${encodeURIComponent(currentProjectId)}`, { cache: "no-store" });
      if (response.status === 404) return { platform: platform.id, connected: false };
      if (!response.ok) throw new Error(`LOAD_${response.status}`);
      const json = await response.json();
      return { platform: platform.id, connected: false, ...(json.data ?? {}) } as PlatformStatus;
    }));
    const failed = results.filter((result) => result.status === "rejected").length;
    setPlatforms(results.map((result, index) => result.status === "fulfilled" ? result.value : { platform: PUBLISHING_PLATFORMS[index].id, connected: false }));
    if (failed === results.length) setError("平台配置暂时无法加载，请稍后重试。");
    else if (failed > 0) addToast({ type: "warning", title: `有 ${failed} 个平台状态加载失败` });
    setLoading(false);
  }, [addToast, currentProjectId]);

  useEffect(() => { setSelectedPlatformId(null); void fetchStatus(); }, [fetchStatus]);

  const selectedPlatform = useMemo(() => PUBLISHING_PLATFORMS.find((platform) => platform.id === selectedPlatformId), [selectedPlatformId]);
  const getStatus = (platformId: string) => platforms.find((platform) => platform.platform === platformId);
  const connectedCount = platforms.filter((platform) => platform.connected).length;

  const savePlatform = async (values: CredentialForm) => {
    if (!currentProjectId || !selectedPlatform) return;
    setSaving(true);
    try {
      const credentials = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
      const response = await fetch(`/api/platform-config/${selectedPlatform.id}?projectId=${encodeURIComponent(currentProjectId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: currentProjectId, ...credentials, enabled: true }),
      });
      if (!response.ok) throw new Error(`SAVE_${response.status}`);
      await fetchStatus();
      setSelectedPlatformId(null);
      addToast({ type: "success", title: `${selectedPlatform.name}配置已保存`, description: `已绑定到项目“${currentProject?.name ?? "当前项目"}”` });
    } catch { addToast({ type: "error", title: "保存失败", description: "请检查平台凭证后重试。" }); }
    finally { setSaving(false); }
  };

  const refreshPlatform = async () => {
    if (!currentProjectId || !selectedPlatform) return;
    setRefreshing(true);
    try {
      const response = await fetch(`/api/platform-config/${selectedPlatform.id}/refresh?projectId=${encodeURIComponent(currentProjectId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: currentProjectId }) });
      if (!response.ok) throw new Error(`REFRESH_${response.status}`);
      await fetchStatus();
      addToast({ type: "success", title: `${selectedPlatform.name}授权已刷新` });
    } catch { addToast({ type: "error", title: "刷新失败", description: "请重新填写授权凭证。" }); }
    finally { setRefreshing(false); }
  };

  const disconnectPlatform = async () => {
    if (!currentProjectId || !selectedPlatform) return;
    setDisconnecting(true);
    try {
      const response = await fetch(`/api/platform-config/${selectedPlatform.id}?projectId=${encodeURIComponent(currentProjectId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`DELETE_${response.status}`);
      await fetchStatus();
      setConfirmDisconnect(false);
      setSelectedPlatformId(null);
      addToast({ type: "success", title: `已解除${selectedPlatform.name}绑定` });
    } catch { addToast({ type: "error", title: "解除绑定失败", description: "请稍后重试。" }); }
    finally { setDisconnecting(false); }
  };

  if (projectLoading) return <div className="space-y-4"><div className="dashboard-skeleton h-12 w-64 animate-skeleton-pulse rounded-xl" /><div className="dashboard-skeleton h-24 animate-skeleton-pulse rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="发布平台" subtitle="为当前账号和项目管理独立的内容发布渠道" />

      {!currentProjectId || !currentProject ? (
        <div className="dashboard-surface dashboard-empty-state">
          <FolderKanban size={32} style={{ color: "var(--text-muted)" }} />
          <h2 className="mt-4 text-base font-semibold" style={{ color: "var(--text-primary)" }}>请先选择一个项目</h2>
          <p className="mt-1 max-w-md text-sm" style={{ color: "var(--text-muted)" }}>平台配置必须绑定到具体项目。请在页面顶部选择项目后继续。</p>
        </div>
      ) : (
        <>
          <section className={`dashboard-surface ${styles.scopeCard}`} aria-label="当前配置范围">
            <div className={styles.scopeItem}><span className={styles.scopeIcon}><UserRound size={17} /></span><div className="min-w-0"><p className="text-xs" style={{ color: "var(--text-muted)" }}>登录账号</p><p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{accountLabel}</p></div></div>
            <div className={styles.scopeDivider} />
            <div className={styles.scopeItem}><span className={styles.scopeIcon}><FolderKanban size={17} /></span><div className="min-w-0"><p className="text-xs" style={{ color: "var(--text-muted)" }}>绑定项目</p><p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{currentProject.name}</p></div></div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-base font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>发布渠道</h2><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>已配置 {connectedCount} / {PUBLISHING_PLATFORMS.length} 个平台</p></div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}><KeyRound size={13} /> 密钥保存后不会明文展示</div>
            </div>

            {loading ? (
              <div className={styles.platformGrid}>{PUBLISHING_PLATFORMS.map((platform) => <div key={platform.id} className="dashboard-skeleton h-[174px] animate-skeleton-pulse rounded-xl" />)}</div>
            ) : error ? (
              <div className="dashboard-surface dashboard-empty-state"><AlertCircle size={30} style={{ color: "var(--color-error)" }} /><p className="mt-3 text-sm" style={{ color: "var(--text-primary)" }}>{error}</p><button className="dashboard-button dashboard-button--secondary mt-4" onClick={fetchStatus}><RefreshCw size={14} />重新加载</button></div>
            ) : (
              <div className={styles.platformGrid}>
                {PUBLISHING_PLATFORMS.map((platform) => {
                  const status = getStatus(platform.id);
                  const connected = status?.connected ?? false;
                  const expiry = formatExpiry(status?.expiresAt);
                  return (
                    <article key={platform.id} className={`dashboard-surface ${styles.platformCard}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3"><PlatformLogo platform={platform} /><div className="min-w-0"><h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{platform.name}</h3><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{platform.description}</p></div></div>
                        <span className={`dashboard-chip ${connected ? "dashboard-chip--success" : ""}`} style={!connected ? { color: "var(--text-muted)", background: "var(--bg-hover)" } : undefined}>{connected ? <Check size={11} /> : null}{connected ? "已配置" : "未配置"}</span>
                      </div>
                      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                        <div className="min-w-0"><p className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>{connected ? status?.accountName || status?.username || "平台账号已连接" : `适用内容：${platform.contentType}`}</p>{expiry && <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>授权有效期至 {expiry}</p>}</div>
                        <button className="dashboard-button dashboard-button--secondary shrink-0" onClick={() => setSelectedPlatformId(platform.id)}>{connected ? <Settings2 size={14} /> : <Plus size={14} />}{connected ? "管理" : "配置"}<ArrowRight size={13} /></button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {selectedPlatform && currentProject && <PlatformDrawer key={`${currentProjectId}-${selectedPlatform.id}`} platform={selectedPlatform} status={getStatus(selectedPlatform.id)} accountLabel={accountLabel} projectName={currentProject.name} saving={saving} refreshing={refreshing} onClose={() => setSelectedPlatformId(null)} onSave={savePlatform} onRefresh={refreshPlatform} onDisconnect={() => setConfirmDisconnect(true)} />}

      <ConfirmDialog open={confirmDisconnect} title={`解除${selectedPlatform?.name ?? "平台"}绑定`} message={`解除后，“${currentProject?.name ?? "当前项目"}”将无法继续发布到此平台，其他项目的配置不受影响。`} confirmLabel={disconnecting ? "正在解除…" : "确认解除"} onCancel={() => !disconnecting && setConfirmDisconnect(false)} onConfirm={() => void disconnectPlatform()} />
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<div className="dashboard-skeleton h-48 animate-skeleton-pulse rounded-xl" />}><SettingsInner /></Suspense>;
}
