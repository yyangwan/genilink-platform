"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useCallback, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ExternalLink, GripVertical, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useProject } from "@/components/project/project-context";
import { formatDateInTimeZone, getDatePartsInTimeZone } from "@/lib/time";

interface RawCalendarEvent {
  id: string;
  status?: string;
  scheduledAt: string;
  contentPiece?: {
    id?: string;
    title?: string;
    status?: string;
    platform?: string;
    platformContents?: Array<{ platform?: string }>;
  };
  title?: string;
  platform?: string;
}

interface CalendarEvent {
  id: string;
  contentId: string;
  title: string;
  status: string;
  platform: string;
  scheduledAt: string;
}

interface ContentItem {
  id: string;
  title: string;
  type?: string;
  platform?: string;
  status: string;
  createdAt: string;
}

interface ContentListData {
  items: ContentItem[];
  total: number;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "草稿", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  approved: { label: "已审核", color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 10%, transparent)" },
  scheduled: { label: "已排期", color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 12%, transparent)" },
  publishing: { label: "发布中", color: "var(--color-primary)", bg: "color-mix(in srgb, var(--color-primary) 14%, transparent)" },
  published: { label: "已发布", color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 12%, transparent)" },
  failed: { label: "失败", color: "var(--color-error)", bg: "color-mix(in srgb, var(--color-error) 12%, transparent)" },
};

const platformLabels: Record<string, string> = {
  wechat: "微信",
  weibo: "微博",
  douyin: "抖音",
  xiaohongshu: "小红书",
  toutiao: "头条",
  zhihu: "知乎",
  generic: "通用",
};

const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultLocalTimeForDay(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:00`;
}

function normalizeCalendarEvent(raw: RawCalendarEvent): CalendarEvent {
  const piece = raw.contentPiece ?? {};
  const platform = raw.platform ?? piece.platform ?? piece.platformContents?.[0]?.platform ?? "generic";
  return {
    id: raw.id,
    contentId: piece.id ?? raw.id,
    title: piece.title ?? raw.title ?? "未命名内容",
    status: raw.status ?? piece.status ?? "scheduled",
    platform,
    scheduledAt: raw.scheduledAt,
  };
}

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.draft;
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, fontFamily: "var(--font-body)" }}
    >
      {cfg.label}
    </span>
  );
}

function CalendarInner() {
  const { currentProjectId } = useProject();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [unscheduled, setUnscheduled] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sideLoading, setSideLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ContentItem | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");

  const todayParts = getDatePartsInTimeZone(new Date()) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
  };
  const [viewYear, setViewYear] = useState(todayParts.year);
  const [viewMonth, setViewMonth] = useState(todayParts.month - 1);

  const loadEvents = useCallback(async () => {
    if (!currentProjectId) {
      setLoading(false);
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        projectId: currentProjectId,
        start: formatDateParam(new Date(Date.UTC(viewYear, viewMonth, 1))),
        end: formatDateParam(new Date(Date.UTC(viewYear, viewMonth + 1, 0))),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/calendar/events?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load_failed");
      const json = await res.json();
      const rows: RawCalendarEvent[] = json.data ?? [];
      setEvents(rows.map(normalizeCalendarEvent));
    } catch {
      setError("加载日历数据失败");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, statusFilter, viewMonth, viewYear]);

  const loadUnscheduled = useCallback(async () => {
    if (!currentProjectId) {
      setSideLoading(false);
      setUnscheduled([]);
      return;
    }

    setSideLoading(true);
    try {
      const params = new URLSearchParams({ projectId: currentProjectId, unscheduled: "true" });
      const res = await fetch(`/api/content?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load_failed");
      const json = await res.json();
      const data: ContentListData = json.data ?? { items: [], total: 0 };
      setUnscheduled(data.items ?? []);
    } catch {
      setUnscheduled([]);
    } finally {
      setSideLoading(false);
    }
  }, [currentProjectId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadEvents(), loadUnscheduled()]);
  }, [loadEvents, loadUnscheduled]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const scheduleContent = useCallback(async (contentId: string, scheduledAt: string) => {
    if (!currentProjectId) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${contentId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, scheduledAt }),
      });
      if (!res.ok) {
        setError("排期保存失败");
        return false;
      }
      await refresh();
      return true;
    } catch {
      setError("排期保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }, [currentProjectId, refresh]);

  const unscheduleContent = useCallback(async (contentId: string) => {
    if (!currentProjectId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/content/${contentId}/schedule?projectId=${encodeURIComponent(currentProjectId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("取消排期失败");
        return;
      }
      setSelected(null);
      await refresh();
    } catch {
      setError("取消排期失败");
    } finally {
      setSaving(false);
    }
  }, [currentProjectId, refresh]);

  const openScheduleDialog = (item: ContentItem, localValue?: string) => {
    setSelected(null);
    setScheduleTarget(item);
    setScheduleValue(localValue ?? toDateTimeLocal(new Date().toISOString()));
  };

  const closeScheduleDialog = () => {
    if (saving) return;
    setScheduleTarget(null);
    setScheduleValue("");
  };

  const saveScheduleDialog = async () => {
    if (!scheduleTarget || !scheduleValue) return;
    const iso = localDateTimeToIso(scheduleValue);
    if (!iso) {
      setError("请选择有效的发布时间");
      return;
    }
    const ok = await scheduleContent(scheduleTarget.id, iso);
    if (ok) closeScheduleDialog();
  };

  const saveSelectedTime = async () => {
    if (!selected || !scheduleValue) return;
    const iso = localDateTimeToIso(scheduleValue);
    if (!iso) {
      setError("请选择有效的发布时间");
      return;
    }
    const ok = await scheduleContent(selected.contentId, iso);
    if (ok) setSelected(null);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    events.forEach((ev) => {
      const d = getDatePartsInTimeZone(ev.scheduledAt);
      if (d && d.year === viewYear && d.month - 1 === viewMonth) {
        (map[d.day] ??= []).push(ev);
      }
    });
    return map;
  }, [events, viewMonth, viewYear]);

  const monthLabel = `${viewYear}年${viewMonth + 1}月`;

  const onDropToDay = async (event: React.DragEvent, day: number) => {
    event.preventDefault();
    const contentId = event.dataTransfer.getData("application/x-content-id");
    const scheduleId = event.dataTransfer.getData("application/x-schedule-content-id");
    const sourceTime = event.dataTransfer.getData("application/x-schedule-time");
    const targetId = contentId || scheduleId;
    if (!targetId) return;

    const sourceDate = sourceTime ? new Date(sourceTime) : null;
    const hours = sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate.getHours() : 9;
    const minutes = sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate.getMinutes() : 0;
    const localValue = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const iso = localDateTimeToIso(localValue);
    if (iso) await scheduleContent(targetId, iso);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            内容日历
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            拖拽内容安排发布时间，管理已排期发布计划
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="text-sm rounded-md"
            style={{ height: 34, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", padding: "0 10px" }}
          >
            <option value="all">全部状态</option>
            <option value="scheduled">已排期</option>
            <option value="publishing">发布中</option>
            <option value="published">已发布</option>
            <option value="failed">失败</option>
          </select>
          <button
            onClick={refresh}
            disabled={loading || sideLoading}
            className="text-sm font-medium px-3 py-2 rounded-md"
            style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)", cursor: loading ? "wait" : "pointer" }}
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm px-3 py-2 rounded-md" style={{ color: "var(--color-error)", background: "color-mix(in srgb, var(--color-error) 10%, transparent)" }}>
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <section style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={prevMonth}
              className="inline-flex items-center justify-center rounded-md"
              style={{ width: 32, height: 32, background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)" }}
              aria-label="上个月"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <CalendarDays size={16} style={{ color: "var(--color-primary)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{monthLabel}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{events.length} 项</span>
            </div>
            <button
              onClick={nextMonth}
              className="inline-flex items-center justify-center rounded-md"
              style={{ width: 32, height: 32, background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)" }}
              aria-label="下个月"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {loading ? (
            <div className="h-[520px] animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <>
              <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--border)" }}>
                {weekDays.map((day) => (
                  <div key={day} className="text-center text-xs font-medium py-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfWeek }).map((_, index) => (
                  <div key={`empty-${index}`} className="min-h-[104px]" style={{ borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-primary)" }} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1;
                  const dayEvents = eventsByDay[day] ?? [];
                  const isToday = day === todayParts.day && viewMonth === todayParts.month - 1 && viewYear === todayParts.year;
                  return (
                    <div
                      key={day}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onDropToDay(event, day)}
                      className="min-h-[104px] p-1.5"
                      style={{
                        borderRight: "1px solid var(--border)",
                        borderBottom: "1px solid var(--border)",
                        background: isToday ? "color-mix(in srgb, var(--color-primary) 5%, transparent)" : undefined,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: isToday ? "var(--color-primary)" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {day}
                        </span>
                        {dayEvents.length > 0 && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{dayEvents.length}</span>}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 4).map((item) => {
                          const cfg = statusConfig[item.status] ?? statusConfig.scheduled;
                          return (
                            <button
                              key={item.id}
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData("application/x-schedule-content-id", item.contentId);
                                event.dataTransfer.setData("application/x-schedule-time", item.scheduledAt);
                              }}
                              onClick={() => {
                                setScheduleValue(toDateTimeLocal(item.scheduledAt));
                                setScheduleTarget(null);
                                setSelected(item);
                              }}
                              className="w-full text-left rounded px-1.5 py-1"
                              style={{ background: cfg.bg, color: cfg.color, border: "none", cursor: "grab", fontFamily: "var(--font-body)" }}
                            >
                              <span className="block text-[11px] truncate">{item.title}</span>
                              <span className="block text-[10px] opacity-80">{formatDateInTimeZone(item.scheduledAt, { includeYear: false })}</span>
                            </button>
                          );
                        })}
                        {dayEvents.length > 4 && (
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>+{dayEvents.length - 4} 更多</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <aside style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>未排期内容</h2>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{unscheduled.length}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>拖到左侧日期，或手动选择发布时间</p>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-2 space-y-2">
            {sideLoading ? (
              <div className="h-24 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ) : unscheduled.length === 0 ? (
              <div className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>暂无未排期内容</div>
            ) : (
              unscheduled.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/x-content-id", item.id)}
                  style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-primary)" }}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical size={15} style={{ color: "var(--text-muted)", marginTop: 2, flex: "0 0 auto" }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{item.title || "未命名内容"}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <StatusBadge status={item.status} />
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{platformLabels[item.platform ?? "generic"] ?? item.platform}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => openScheduleDialog(item, defaultLocalTimeForDay(viewYear, viewMonth, Math.min(todayParts.day, daysInMonth)))}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md"
                      style={{ background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer" }}
                    >
                      <Clock size={12} />
                      排期
                    </button>
                    <Link
                      href={`/content/${item.id}/edit`}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md"
                      style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", textDecoration: "none" }}
                    >
                      <ExternalLink size={12} />
                      编辑
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {(selected || scheduleTarget) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.36)" }}
          onClick={() => {
            if (!saving) {
              setSelected(null);
              closeScheduleDialog();
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: 18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              {selected ? "日程操作" : "安排发布"}
            </h2>
            <p className="text-sm mt-1 truncate" style={{ color: "var(--text-secondary)" }}>
              {selected?.title ?? scheduleTarget?.title}
            </p>
            {selected && (
              <div className="mt-3">
                <StatusBadge status={selected.status} />
              </div>
            )}
            <label className="block text-xs font-medium mt-4 mb-1" style={{ color: "var(--text-muted)" }}>发布时间</label>
            <input
              type="datetime-local"
              value={scheduleValue}
              onChange={(event) => setScheduleValue(event.target.value)}
              className="w-full rounded-md"
              style={{ height: 38, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", padding: "0 10px" }}
            />
            <div className="flex items-center gap-2 mt-5">
              {selected && (
                <Link
                  href={`/content/${selected.contentId}/edit`}
                  className="inline-flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-md"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", textDecoration: "none" }}
                >
                  <ExternalLink size={13} />
                  编辑
                </Link>
              )}
              {selected && (
                <button
                  onClick={() => unscheduleContent(selected.contentId)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-md"
                  style={{ color: "var(--color-error)", border: "1px solid var(--color-error)", background: "transparent", cursor: saving ? "wait" : "pointer" }}
                >
                  <Trash2 size={13} />
                  取消排期
                </button>
              )}
              <button
                onClick={() => {
                  setSelected(null);
                  closeScheduleDialog();
                }}
                disabled={saving}
                className="text-sm font-medium px-3 py-2 rounded-md ml-auto"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", background: "transparent", cursor: saving ? "wait" : "pointer" }}
              >
                关闭
              </button>
              <button
                onClick={selected ? saveSelectedTime : saveScheduleDialog}
                disabled={saving || !scheduleValue}
                className="inline-flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-md"
                style={{ background: "var(--color-primary)", color: "white", border: "none", cursor: saving ? "wait" : "pointer", opacity: saving || !scheduleValue ? 0.65 : 1 }}
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <CalendarInner />
    </Suspense>
  );
}
