import type { SocialAccount, SocialProvider } from '@prisma/client';
import type { NormalizedSocialMetrics } from '../social-metrics.types';

export interface SocialAdapter {
  provider: SocialProvider;
  fetchMetrics(account: SocialAccount): Promise<NormalizedSocialMetrics>;
}
