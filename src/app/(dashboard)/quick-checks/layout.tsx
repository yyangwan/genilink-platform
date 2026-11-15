import type { ReactNode } from 'react';
import './quick-checks.css';

export default function QuickChecksLayout({ children }: { children: ReactNode }) {
  return <div className="quick-checks">{children}</div>;
}
