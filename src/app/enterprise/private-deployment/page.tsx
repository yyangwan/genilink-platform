import type { Metadata } from 'next';
import { LeadForm } from '@/components/marketing/lead-form';

export const metadata: Metadata = { title: '私有化部署 | 智链', description: '评估智链平台的数据位置、认证集成、模型选择和私有化运维需求。', alternates: { canonical: '/enterprise/private-deployment' } };

export default function PrivateDeploymentPage() {
  return <main className="mx-auto max-w-5xl px-6 py-16"><section className="mb-10 max-w-3xl"><p className="mb-3 text-sm text-[var(--color-primary)]">企业与私有化</p><h1 className="mb-4 text-4xl font-semibold">按你的数据与部署边界进行需求评估</h1><p className="text-[var(--text-secondary)]">可评估数据位置、统一认证、模型接入和运维方式。具体能力以需求评估结果为准。</p></section><LeadForm kind="private_deployment" /></main>;
}
