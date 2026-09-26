import type { Metadata } from 'next';
import { LeadForm } from '@/components/marketing/lead-form';

export const metadata: Metadata = { title: '代理商合作 | 智链', description: '面向运营代理商的多项目 AI 搜索增长合作方案。', alternates: { canonical: '/partners' } };

export default function PartnersPage() {
  return <main className="mx-auto max-w-5xl px-6 py-16"><section className="mb-10 max-w-3xl"><p className="mb-3 text-sm text-[var(--color-primary)]">代理商合作</p><h1 className="mb-4 text-4xl font-semibold">批量管理客户的 AI 搜索增长工作</h1><p className="text-[var(--text-secondary)]">提交客户规模和交付需求，我们会评估多项目管理、报告交付和合作方式。</p></section><LeadForm kind="agency" /></main>;
}
