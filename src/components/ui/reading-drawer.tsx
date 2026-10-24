"use client";

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native modal semantics provide focus containment and inert background content. */
export function ReadingDrawer({ title, children, onClose, eyebrow = '原文与证据', closeLabel = '关闭原文' }: { title: string; children: ReactNode; onClose: () => void; eyebrow?: string; closeLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return <dialog ref={ref} className="reading-drawer" aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    } }}>
    <header className="reading-drawer__header"><div><p className="audit-eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="dashboard-button dashboard-button--secondary" aria-label={closeLabel} onClick={onClose}><X size={18} /></button></header>
    <div className="reading-drawer__body">{children}</div>
  </dialog>;
}
