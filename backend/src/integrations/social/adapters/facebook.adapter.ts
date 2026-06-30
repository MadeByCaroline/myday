import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SocialAccount } from '@prisma/client';
import axios from 'axios';
import type { SocialAdapter } from './social.adapter';
import { normalizeMetrics } from './metrics-normalizer';

@Injectable()
export class FacebookAdapter implements SocialAdapter {
  readonly provider = 'FACEBOOK' as const;

  constructor(private readonly configService: ConfigService) {}

  async fetchMetrics(account: SocialAccount) {
    const version = this.configService.get<string>('META_GRAPH_API_VERSION') || 'v22.0';
    const baseUrl = `https://graph.facebook.com/${version}`;

    const [{ data: insights }, { data: page }] = await Promise.all([
      axios.get(`${baseUrl}/${account.externalAccountId}/insights`, {
        params: {
          metric: 'page_impressions,page_post_engagements',
          access_token: account.accessToken,
        },
      }),
      axios.get(`${baseUrl}/${account.externalAccountId}`, {
        params: {
          fields: 'followers_count',
          access_token: account.accessToken,
        },
      }),
    ]);

    const rows: Array<{ name?: string; values?: Array<{ value?: number | string }> }> =
      Array.isArray(insights?.data) ? insights.data : [];

    const metricByName = new Map<string, number>();
    for (const row of rows) {
      const value = Number(row.values?.[0]?.value ?? 0);
      metricByName.set(row.name || '', Number.isFinite(value) ? value : 0);
    }

    return normalizeMetrics({
      views: metricByName.get('page_impressions'),
      likes: metricByName.get('page_post_engagements'),
      comments: 0,
      followers: page?.followers_count,
    });
  }
}
