import { normalizeMetrics } from './metrics-normalizer';

describe('normalizeMetrics', () => {
  it('normalizes incoming API payload values', () => {
    const normalized = normalizeMetrics({
      views: '1000',
      followers: 120,
      likes: '50',
      comments: 10,
    });

    expect(normalized).toEqual({
      totalViews: 1000,
      followerCount: 120,
      engagementRate: 0.06,
    });
  });

  it('returns a zero engagement rate when views are missing', () => {
    const normalized = normalizeMetrics({
      followers: '12',
      likes: '8',
      comments: '2',
    });

    expect(normalized).toEqual({
      totalViews: 0,
      followerCount: 12,
      engagementRate: 0,
    });
  });
});
