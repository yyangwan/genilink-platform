import type { Metadata } from 'next';
import DashboardLayout from '@/app/(dashboard)/layout';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
