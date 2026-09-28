import { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site'

/**
 * Only pages that exist and that we want indexed.
 *
 * This used to advertise `/about`, which has never been a route — so every crawl
 * fetched a 404 from our own sitemap. The two legal pages were missing instead,
 * and those are the ones that matter most right now: Google's OAuth brand
 * verification checks that the privacy policy is publicly reachable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const pages: Array<{
    path: string
    changeFrequency: 'weekly' | 'monthly' | 'yearly'
    priority: number
  }> = [
    { path: '', changeFrequency: 'weekly', priority: 1 },
    { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/auth/signup', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/auth/login', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/product/learning', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/product/practice', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/product/analytics', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/download', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/careers', changeFrequency: 'monthly', priority: 0.4 },
    { path: '/legal/privacy', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/legal/terms', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/legal/cookies', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/legal/refunds', changeFrequency: 'yearly', priority: 0.3 },
  ]

  return pages.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
