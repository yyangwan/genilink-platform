import type { MetadataRoute } from 'next';

const publicUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://genilink.cn';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/checkout/', '/dashboard/', '/ops/', '/settings/', '/start'],
    }],
    sitemap: new URL('/sitemap.xml', publicUrl).toString(),
    host: new URL(publicUrl).origin,
  };
}
