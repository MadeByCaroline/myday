export interface NormalizedSocialMetrics {
  totalViews: number;
  followerCount: number;
  engagementRate: number;
}

export interface SocialTrendMetrics extends NormalizedSocialMetrics {
  provider: string;
  changeVsLastWeek: number | null;
  syncedAt: Date | null;
}
