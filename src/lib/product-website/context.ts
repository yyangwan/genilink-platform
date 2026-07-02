import type {
  ProductWebsiteBrandContext,
  ProductWebsiteProjectContext,
  ProductWebsiteUpstreamAnalyzeRequest,
} from '@/types/product-website';
import { prisma } from '@/lib/db';
import { normalizeProductWebsiteUrl } from './url';

type ProductForWebsiteAnalysis = {
  name: string;
  url: string | null;
  industry: string | null;
  productName: string | null;
  productKeywords: string[];
  productDescription: string | null;
  productUrl: string | null;
};

export async function getProductWebsiteProject(projectId: string, workspaceId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: {
      name: true,
      url: true,
      industry: true,
      productName: true,
      productKeywords: true,
      productDescription: true,
      productUrl: true,
    },
  });
}

export async function getProductWebsiteBrands(projectId: string): Promise<ProductWebsiteBrandContext[]> {
  const associations = await prisma.projectBrand.findMany({
    where: { projectId },
    include: { brand: true },
  });

  return associations
    .filter((association) => association.brand && !association.brand.deletedAt)
    .map((association) => ({
      id: association.brand.id,
      name: association.brand.name,
      aliases: association.brand.aliases || [],
      is_competitor: association.brand.isCompetitor || false,
    }));
}

export function buildProductWebsiteProjectContext(project: ProductForWebsiteAnalysis): ProductWebsiteProjectContext {
  return {
    name: project.name || '',
    url: project.url || '',
    industry: project.industry || '',
    product_name: project.productName || project.name || '',
    product_keywords: project.productKeywords || [],
    product_description: project.productDescription || '',
    product_url: project.productUrl || '',
  };
}

export function buildProductWebsiteAnalyzePayload(input: {
  projectId: string;
  workspaceId: string;
  project: ProductForWebsiteAnalysis;
  brands: ProductWebsiteBrandContext[];
  requestedUrl?: unknown;
  enableAiCitation?: unknown;
  crawlerProvider?: unknown;
}): ProductWebsiteUpstreamAnalyzeRequest | { error: string } {
  const target = input.requestedUrl || input.project.productUrl || input.project.url;
  const normalized = normalizeProductWebsiteUrl(target);
  if (!normalized.ok) {
    return { error: normalized.error };
  }

  const options: ProductWebsiteUpstreamAnalyzeRequest['options'] = {};
  if (typeof input.enableAiCitation === 'boolean') {
    options.enable_ai_citation = input.enableAiCitation;
  }
  if (input.crawlerProvider === 'native' || input.crawlerProvider === 'firecrawl') {
    options.crawler_provider = input.crawlerProvider;
  }

  return {
    project_id: input.projectId,
    workspace_id: input.workspaceId,
    target_url: normalized.url,
    project: buildProductWebsiteProjectContext(input.project),
    brands: input.brands,
    ...(Object.keys(options).length ? { options } : {}),
  };
}
