import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_name: string;
  workspace_id: string;
  owner: { type: string; user?: { id: string } };
}

export interface NotionDatabase {
  id: string;
  title: Array<{ plain_text: string }>;
}

export interface NotionPage {
  id: string;
  properties: Record<
    string,
    {
      type: string;
      title?: Array<{ plain_text: string }>;
      rich_text?: Array<{ plain_text: string }>;
      select?: { name: string } | null;
      status?: { name: string } | null;
      date?: { start: string } | null;
      checkbox?: boolean;
    }
  >;
}

const NOTION_API_BASE = 'https://api.notion.com/v1';
// Notion API version — check https://developers.notion.com/reference/versioning when upgrading
const NOTION_VERSION = '2022-06-28';

@Injectable()
export class NotionOAuthService {
  private readonly logger = new Logger(NotionOAuthService.name);

  constructor(private readonly configService: ConfigService) {}

  getAuthorizationUrl(userId: string, redirectUri: string): string {
    const clientId = this.configService.get<string>('NOTION_CLIENT_ID');
    if (!clientId) {
      throw new Error('NOTION_CLIENT_ID is not configured');
    }

    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      owner: 'user',
      state,
    });

    return `${NOTION_API_BASE}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<NotionTokenResponse> {
    const clientId = this.configService.getOrThrow<string>('NOTION_CLIENT_ID');
    const clientSecret = this.configService.getOrThrow<string>(
      'NOTION_CLIENT_SECRET',
    );

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    const { data } = await axios.post<NotionTokenResponse>(
      `${NOTION_API_BASE}/oauth/token`,
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return data;
  }

  decodeState(state: string | undefined): { userId: string } | null {
    if (!state) return null;
    try {
      return JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
        userId: string;
      };
    } catch {
      this.logger.warn('Failed to decode Notion OAuth state');
      return null;
    }
  }

  async listDatabases(accessToken: string): Promise<NotionDatabase[]> {
    const { data } = await axios.post<{
      results: Array<{ id: string; title: Array<{ plain_text: string }> }>;
    }>(
      `${NOTION_API_BASE}/search`,
      { filter: { property: 'object', value: 'database' } },
      {
        headers: this.buildHeaders(accessToken),
      },
    );

    return data.results;
  }

  async queryDatabase(
    accessToken: string,
    databaseId: string,
  ): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      const { data } = await axios.post<{
        results: NotionPage[];
        has_more: boolean;
        next_cursor: string | null;
      }>(
        `${NOTION_API_BASE}/databases/${databaseId}/query`,
        cursor ? { start_cursor: cursor } : {},
        { headers: this.buildHeaders(accessToken) },
      );

      pages.push(...data.results);
      hasMore = data.has_more;
      cursor = data.next_cursor ?? undefined;
    }

    return pages;
  }

  buildHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: 'Bearer ' + accessToken,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }
}
