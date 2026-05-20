"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { FolderKanban, ChevronDown, Check, Plus, X } from "lucide-react";
import { useProject } from "./project-context";
import { useToast } from "@/components/ui/toast-context";

export function ProjectSelector() {
  const { projects, currentProject, selectProject, openWizard, loading } = useProject();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (id: string) => {
      selectProject(id);
      setOpen(false);
      addToast({ type: "success", title: "已切换项目" });
    },
    [selectProject, addToast]
  );

  const handleOpen = useCallback(() => {
    setOpen((prev) => !prev);
    setFocusedIndex(-1);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      const total = projects.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % total);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + total) % total);
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        handleSelect(projects[focusedIndex].id);
      }
    },
    [open, projects, focusedIndex, handleSelect]
  );

  const label = currentProject?.name || (loading ? "加载中..." : "选择项目");

  return (
    <div style={{ position: "relative" }} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px",
          background: open ? "var(--bg-elevated)" : "transparent",
          border: `1px solid ${open ? "var(--color-primary)" : "var(--border)"}`,
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: "var(--font-body)",
          height: 32,
          minWidth: 0,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FolderKanban size={15} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
          {label}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform var(--duration-short) var(--ease)",
          }}
        />
      </button>

      {open && (
        <>
          {/* Mobile overlay */}
          <div
            className="show-mobile-only"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: "var(--z-sidebar)",
            }}
            onClick={() => setOpen(false)}
          />

          {/* Desktop dropdown */}
          <div
            ref={listRef}
            className="hide-mobile"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              minWidth: 260,
              maxHeight: 320,
              overflowY: "auto",
              zIndex: "var(--z-sidebar)",
            }}
            role="listbox"
          >
            {projects.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center" }}>
                <div style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
                  暂无项目
                </div>
                <button
                  onClick={() => { setOpen(false); openWizard(); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    background: "var(--color-primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <Plus size={14} /> 创建第一个项目
                </button>
              </div>
            ) : (
              <>
                {projects.map((project, i) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelect(project.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 12px",
                      background:
                        i === focusedIndex
                          ? "var(--bg-hover)"
                          : project.id === currentProject?.id
                            ? "var(--color-primary-dim)"
                            : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      textAlign: "left",
                      fontFamily: "var(--font-body)",
                    }}
                    role="option"
                    aria-selected={project.id === currentProject?.id}
                  >
                    {project.id === currentProject?.id && (
                      <Check size={14} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                    )}
                    <span style={{ marginLeft: project.id === currentProject?.id ? 0 : 22 }}>
                      {project.name}
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => { setOpen(false); openWizard(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    padding: "10px 12px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <Plus size={14} /> 创建项目
                </button>
              </>
            )}
          </div>

          {/* Mobile bottom sheet */}
          <div
            className="show-mobile-only"
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "var(--bg-card)",
              borderRadius: "16px 16px 0 0",
              maxHeight: "70vh",
              overflowY: "auto",
              zIndex: "calc(var(--z-sidebar) + 1)",
              animation: "sheet-slide-up var(--duration-medium) var(--ease)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--border-strong)",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 16px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                选择项目
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
              >
                <X size={18} />
              </button>
            </div>
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSelect(project.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "14px 16px",
                  background: project.id === currentProject?.id ? "var(--color-primary-dim)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  fontSize: 15,
                  textAlign: "left",
                  minHeight: 48,
                  fontFamily: "var(--font-body)",
                }}
                role="option"
                aria-selected={project.id === currentProject?.id}
              >
                {project.id === currentProject?.id && (
                  <Check size={16} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                )}
                <span style={{ marginLeft: project.id === currentProject?.id ? 0 : 24 }}>
                  {project.name}
                </span>
              </button>
            ))}
            <button
              onClick={() => { setOpen(false); openWizard(); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "14px 16px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--color-primary)",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "var(--font-body)",
              }}
            >
              <Plus size={16} /> 创建项目
            </button>
          </div>
        </>
      )}
    </div>
  );
}
