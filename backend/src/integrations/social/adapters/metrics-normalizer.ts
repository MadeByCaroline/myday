import type { NormalizedSocialMetrics } from '../social-metrics.types';

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function normalizeMetrics(input: {
  views?: unknown;
  followers?: unknown;
  likes?: unknown;
  comments?: unknown;
}): NormalizedSocialMetrics {
  const totalViews = Math.max(0, Math.floor(asNumber(input.views)));
  const followerCount = Math.max(0, Math.floor(asNumber(input.followers)));
  const likes = Math.max(0, Math.floor(asNumber(input.likes)));
  const comments = Math.max(0, Math.floor(asNumber(input.comments)));
  const engagementRate = totalViews > 0 ? Number(((likes + comments) / totalViews).toFixed(4)) : 0;

  return {
    totalViews,
    followerCount,
    engagementRate,
  };
}
