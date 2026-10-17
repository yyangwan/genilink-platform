"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type Counts = Record<string, number>;
type Diagnostics = {
  project_id: string; observed_at: string; enabled: boolean;
  worker: { status: string; recent_count: number; last_seen_at: string | null; threshold_seconds: number; storage_configuration: Counts; temporary_disk: Counts };
  queue: { counts: Counts; due: number; oldest_due_at: string | null; expired_leases: number; recent_failures: { id: string; category: string }[] };
  sources: { fetches_last_24h: Counts; snapshot_integrity_records: Counts };
  usage: { model_request_reservations: number; unknown_job_records: number };
};
const labels: Record<string, string> = {
  queued: "排队", retry_wait: "等待重试", leased: "执行中", succeeded: "完成", failed: "失败",
  configuration_verified: "配置检查通过", development_local: "开发环境本地存储", unknown: "未知或检查已过期",
  ok: "可用空间达到阈值", low: "可用空间低于 256 MiB", verified: "入库时校验通过",
  captured: "已采集", blocked: "访问受限", unavailable: "不可用", timeout: "超时", http_error: "HTTP 错误",
  not_found: "页面不存在", unsupported_format: "不支持的格式", unsupported_encoding: "不支持的编码",
  source_too_large: "正文超出限制", empty_content: "空白正文", invalid_redirect: "无效跳转", redirect_limit: "跳转次数超限", other: "其他",
};
function CountsList({ values }: { values: Counts }) {
  return Object.keys(values).length ? <dl className="space-y-2">{Object.entries(values).map(([name, count]) => <div key={name} className="flex justify-between gap-4"><dt>{labels[name] || "其他"}</dt><dd>{count}</dd></div>)}</dl> : <p className="text-sm text-[var(--text-secondary)]">暂无记录</p>;
}
function timestamp(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "暂无记录"; }

export function OperationsContent({ projectId }: { projectId: string }) {
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${projectId}:${refresh}`;
  const [result, setResult] = useState<{ key: string; data: Diagnostics | null; error: string } | null>(null);
  const current = result?.key === requestKey ? result : null;
  const data = current?.data;
  const error = current?.error;
  const loading = !current;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: "operations" })}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("诊断数据暂不可用，请确认项目访问权限和服务订阅后重试。");
        const value: Diagnostics = await response.json();
        if (value.project_id !== projectId || !value.worker || !value.queue || !value.sources || !value.usage) throw new Error("诊断数据与当前项目不一致，请重试。");
        if (!controller.signal.aborted) setResult({ key: requestKey, data: value, error: "" });
      })
      .catch(reason => {
        const message = reason instanceof Error && ["诊断数据暂不可用，请确认项目访问权限和服务订阅后重试。", "诊断数据与当前项目不一致，请重试。"].includes(reason.message) ? reason.message : "诊断数据暂不可用，请重试。";
        if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: message });
      });
    return () => controller.abort();
  }, [projectId, requestKey]);
  return <div className="space-y-6">
    <PageHeader title="分析运行诊断" subtitle="查看当前项目积压与共享分析服务的近期状态" actions={<><Link className="text-sm" href={`/intelligence?${new URLSearchParams({ project: projectId })}`}>返回证据分析</Link><button className="btn-secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>刷新诊断</button></>} />
    <p className="text-sm text-[var(--text-secondary)]">刷新仅查询已有记录，不启动抓取、分析或模型调用。</p>
    {loading && <p role="status">正在读取诊断记录…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p className="text-sm">观测时间：{timestamp(data.observed_at)} · 分析功能{data.enabled ? "已启用" : "未启用"}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">Worker 心跳</h2><p>{data.worker.status === "recent" ? `近期在线 ${data.worker.recent_count} 个` : data.worker.status === "missing" ? "未收到近期心跳" : "尚无心跳记录"}</p><p className="text-sm">最近一次：{timestamp(data.worker.last_seen_at)}</p><p className="text-sm text-[var(--text-secondary)]">共享服务状态；{data.worker.threshold_seconds} 秒内的空闲或工作心跳计为近期在线，不代表任务一定成功。</p></section>
        <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">任务积压</h2><p>到期可执行：{data.queue.due}</p><p>最早到期：{timestamp(data.queue.oldest_due_at)}</p><p>租约已过期：{data.queue.expired_leases}</p><CountsList values={data.queue.counts} /><p className="text-sm text-[var(--text-secondary)]">状态总数包含历史任务；未来重试未计入到期积压。</p></section>
        <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">存储配置检查</h2><CountsList values={data.worker.storage_configuration} /><p className="text-sm text-[var(--text-secondary)]">按近期在线 worker 统计。通过仅表示私有 ACL 和禁用版本控制配置已核验，不代表所有对象可读写或正文完整。</p></section>
        <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">Worker 临时盘</h2><CountsList values={data.worker.temporary_disk} /><p className="text-sm text-[var(--text-secondary)]">检查系统临时目录所在磁盘；不执行清理。</p></section>
        <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">近 24 小时来源抓取</h2><CountsList values={data.sources.fetches_last_24h} /></section>
        <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">正文完整性记录</h2><CountsList values={data.sources.snapshot_integrity_records} /><p className="text-sm text-[var(--text-secondary)]">这里展示已保存的入库校验记录。本次查询未重新读取 OSS 对象校验，暂无记录不代表检查通过。</p></section>
      </div>
      <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">用量与恢复准备</h2><p>项目累计模型请求预留：{data.usage.model_request_reservations} 次</p><p className="text-sm text-[var(--text-secondary)]">调用前预留的预算计数，可能包含重试或尚未发出的请求，不等于计费次数或账单。未知用量任务记录：{data.usage.unknown_job_records}。</p><p>实际费用、OSS 流量、联合备份恢复验证：未接入</p></section>
      <section className="dashboard-surface dashboard-surface--padded space-y-3"><h2 className="font-semibold">最近失败任务（最多 10 条）</h2>{data.queue.recent_failures.length ? <ul className="space-y-2">{data.queue.recent_failures.map(row => <li key={row.id} className="break-all text-sm">{row.id} · {row.category === "other" ? "其他失败（详情请运维核查）" : row.category}</li>)}</ul> : <p>暂无失败任务记录</p>}</section>
    </>}
  </div>;
}
