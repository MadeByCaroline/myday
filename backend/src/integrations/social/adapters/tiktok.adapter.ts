import { Injectable } from '@nestjs/common';
import type { SocialAccount } from '@prisma/client';
import axios from 'axios';
import type { SocialAdapter } from './social.adapter';
import { normalizeMetrics } from './metrics-normalizer';

@Injectable()
export class TikTokAdapter implements SocialAdapter {
  readonly provider = 'TIKTOK' as const;

  async fetchMetrics(account: SocialAccount) {
    const { data } = await axios.get('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/', {
      params: {
        advertiser_id: account.externalAccountId,
        fields: 'show_cnt,click_cnt,like_cnt,comment_cnt,follower_count',
      },
      headers: {
        Authorization: 'Bearer ' + account.accessToken,
      },
    });

    const report = data?.data?.list?.[0] || {};

    return normalizeMetrics({
      views: report.show_cnt,
      likes: report.like_cnt ?? report.click_cnt,
      comments: report.comment_cnt,
      followers: report.follower_count,
    });
  }
}
