"use client";

/**
 * Brief 编辑器（设计 §16.2）：展示并编辑创作主题、结构、关键词、备注。
 * locked 约束与来源只读展示；候选标题只读（由规则/AI 生成供参考）。
 */

import React from "react";
import { Plus, X } from "lucide-react";

export interface BriefOutlineItem {
  id: string;
  heading: string;
  purpose: string;
  evidenceRefs: string[];
}

export interface BriefEditorValue {
  topic: string;
  titleCandidates: string[];
  outline: BriefOutlineItem[];
  keywords: string[];
  references: Array<{ id: string; url: string; label?: string; source: string }>;
  notes: string;
  mustMention: string[];
  avoidMention: string[];
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  outline: "none",
};

const OUTLINE_MIN = 4;
const OUTLINE_MAX = 12;

function TagList({ items, tone }: { items: string[]; tone: "must" | "avoid" }) {
  if (items.length === 0) return <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>无</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className="dashboard-chip text-xs"
          style={{
            background: tone === "must" ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "var(--bg-card)",
            color: tone === "must" ? "var(--color-primary)" : "var(--text-secondary)",
            border: `1px solid ${tone === "must" ? "color-mix(in srgb, var(--color-primary) 35%, transparent)" : "var(--border)"}`,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function BriefEditor({
  value,
  onChange,
  disabled,
}: {
  value: BriefEditorValue;
  onChange: (next: BriefEditorValue) => void;
  disabled?: boolean;
}) {
  const updateOutline = (index: number, patch: Partial<BriefOutlineItem>) => {
    onChange({
      ...value,
      outline: value.outline.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="dashboard-field-label">
          内容主题 <span style={{ color: "var(--color-primary)" }}>*</span>
        </label>
        <input
          value={value.topic}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, topic: e.target.value })}
          placeholder="例如：品牌如何提升 AI 搜索场景下的可见性与可信度"
          className="dashboard-input px-3 py-2 text-sm"
          style={inputStyle}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        {value.titleCandidates.length > 1 && (
          <div className="mt-2 space-y-1">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>候选标题（供参考）：</span>
            {value.titleCandidates.slice(0, 5).map((title, i) => (
              <div key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {i + 1}. {title}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="dashboard-field-label">内容结构（{value.outline.length} 节，{OUTLINE_MIN}–{OUTLINE_MAX} 节）</label>
        <div className="space-y-2">
          {value.outline.map((section, i) => (
            <div key={section.id} className="dashboard-surface dashboard-surface--padded space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  第 {i + 1} 节
                </span>
                <input
                  value={section.heading}
                  disabled={disabled}
                  onChange={(e) => updateOutline(i, { heading: e.target.value })}
                  placeholder="小节标题（读者视角）"
                  maxLength={120}
                  className="dashboard-input px-3 py-1.5 text-sm"
                  style={{ ...inputStyle, fontWeight: 500 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                {value.outline.length > OUTLINE_MIN && !disabled && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...value, outline: value.outline.filter((_, idx) => idx !== i) })
                    }
                    className="dashboard-icon-button shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <textarea
                value={section.purpose}
                disabled={disabled}
                onChange={(e) => updateOutline(i, { purpose: e.target.value })}
                placeholder="这一节要为读者回答什么问题"
                rows={2}
                maxLength={800}
                className="dashboard-input px-3 py-1.5 text-sm"
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
          ))}
        </div>
        {!disabled && value.outline.length < OUTLINE_MAX && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                outline: [
                  ...value.outline,
                  {
                    id: `section_new_${Date.now()}`,
                    heading: "",
                    purpose: "",
                    evidenceRefs: [],
                  },
                ],
              })
            }
            className="dashboard-button dashboard-button--secondary mt-2"
          >
            <Plus size={14} />
            添加小节
          </button>
        )}
      </div>

      <div>
        <label className="dashboard-field-label">关键词</label>
        <input
          value={value.keywords.join("、")}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              keywords: e.target.value
                .split(/[、,，\s]+/)
                .map((k) => k.trim())
                .filter(Boolean)
                .slice(0, 20),
            })
          }
          placeholder="用顿号或逗号分隔，例如：AI 搜索、品牌可见性"
          className="dashboard-input px-3 py-2 text-sm"
          style={inputStyle}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>

      {value.references.length > 0 && (
        <div>
          <label className="dashboard-field-label">参考资料（来自建议，只读）</label>
          <div className="space-y-1">
            {value.references.map((ref) => (
              <div key={ref.id} className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                <a href={ref.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>
                  {ref.label || ref.url}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="dashboard-field-label">必须提及（服务端锁定）</label>
          <TagList items={value.mustMention} tone="must" />
        </div>
        <div>
          <label className="dashboard-field-label">需要避免（服务端锁定）</label>
          <TagList items={value.avoidMention} tone="avoid" />
        </div>
      </div>

      <div>
        <label className="dashboard-field-label">备注</label>
        <textarea
          value={value.notes}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="对生成内容的额外要求（内部观察指标等）"
          rows={4}
          maxLength={4000}
          className="dashboard-input px-3 py-2 text-sm"
          style={{ ...inputStyle, resize: "vertical" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>
    </div>
  );
}
