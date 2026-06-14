"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useProject } from "@/components/project/project-context";
import { getDatePartsInTimeZone } from "@/lib/time";

interface CalendarEvent {
  id: string;
  title: string;
  status: string;
  platform?: string;
  scheduledAt: string;
}

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "20px",
};

const statusColors: Record<string, { color: string; bg: string }> = {
  draft: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  scheduled: { color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 12%, transparent)" },
  published: { color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 12%, transparent)" },
  failed: { color: "var(--color-error)", bg: "color-mix(in srgb, var(--color-error) 12%, transparent)" },
};

function CalendarInner() {
  const { currentProjectId } = useProject();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayParts = getDatePartsInTimeZone(new Date()) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
  };
  const [viewYear, setViewYear] = useState(todayParts.year);
  const [viewMonth, setViewMonth] = useState(todayParts.month - 1);

  const fetchEvents = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events?projectId=${currentProjectId}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      setEvents(json.data ?? []);
    } catch {
      setError("加载日历数据失败");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

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
  }, [events, viewYear, viewMonth]);

  const isToday = (day: number) =>
    day === todayParts.day &&
    viewMonth === todayParts.month - 1 &&
    viewYear === todayParts.year;

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
  const monthLabel = `${viewYear}年${viewMonth + 1}月`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            内容日历
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            查看和管理内容发布计划
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-md"
          style={{ background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)" }}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          {monthLabel}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-md"
          style={{ background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)" }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="h-64 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
      ) : error ? (
        <div style={card} className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--color-error)", fontFamily: "var(--font-body)" }}>
            {error}
          </p>
          <button
            onClick={fetchEvents}
            className="mt-3 text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: "var(--color-primary)", color: "white", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            重试
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--border)" }}>
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs font-medium py-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`e${i}`} className="min-h-[80px] p-1" style={{ borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = eventsByDay[day] ?? [];
              return (
                <div
                  key={day}
                  className="min-h-[80px] p-1.5"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    borderRight: "1px solid var(--border)",
                    background: isToday(day) ? "color-mix(in srgb, var(--color-primary) 5%, transparent)" : undefined,
                  }}
                >
                  <div
                    className="text-xs font-medium mb-1"
                    style={{
                      color: isToday(day) ? "var(--color-primary)" : "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const sc = statusColors[ev.status] ?? statusColors.draft;
                      return (
                        <Link
                          key={ev.id}
                          href={`/content/${ev.id}/edit`}
                          className="block text-[10px] px-1 py-0.5 rounded truncate"
                          style={{
                            background: sc.bg,
                            color: sc.color,
                            fontFamily: "var(--font-body)",
                            textDecoration: "none",
                          }}
                        >
                          {ev.title || "无标题"}
                        </Link>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        +{dayEvents.length - 3} 更多
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
