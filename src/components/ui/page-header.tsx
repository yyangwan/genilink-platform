"use client";

import React from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { NotificationDropdown } from "@/components/ui/notification-dropdown";
import type { Notification } from "@/types/visibility";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  notifications?: {
    items: Notification[];
    unreadCount: number;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
  };
}

export function PageHeader({ title, subtitle, breadcrumbs, actions, notifications }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        {breadcrumbs && (
          <div className="mb-2">
            <Breadcrumb items={breadcrumbs} />
          </div>
        )}
        <h1
          className="font-semibold tracking-tight"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-sectionHeading)",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {notifications && (
          <NotificationDropdown
            notifications={notifications.items}
            unreadCount={notifications.unreadCount}
            onMarkRead={notifications.onMarkRead}
            onMarkAllRead={notifications.onMarkAllRead}
          />
        )}
        {actions}
      </div>
    </div>
  );
}
