import type { MetadataRoute } from 'next';
import { blogArticles } from '@/lib/marketing-content';

const publicUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://genilink.cn';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = [
    { url: new URL('/', publicUrl).toString(), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: new URL('/blog', publicUrl).toString(), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: new URL('/pricing-guide', publicUrl).toString(), lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: new URL('/partners', publicUrl).toString(), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: new URL('/enterprise/private-deployment', publicUrl).toString(), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: new URL('/faq', publicUrl).toString(), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: new URL('/support', publicUrl).toString(), lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: new URL('/privacy', publicUrl).toString(), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: new URL('/terms', publicUrl).toString(), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
  return routes.concat(blogArticles.map((article) => ({
    url: new URL(`/blog/${article.slug}`, publicUrl).toString(),
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  })));
}
