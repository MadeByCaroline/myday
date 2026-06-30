import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { IntegrationProviderError } from './integration-provider.error';
import {
  getProviderCircuitBreaker,
  resolveIntegrationTimeoutMs,
  withTimeout,
} from './resilience';

export interface EmailSummary {
  id?: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

export interface EmailDetail extends EmailSummary {
  body: string;
}

interface GmailMessagePart {
  body?: { data?: string | null };
  mimeType?: string | null;
  parts?: GmailMessagePart[] | null;
}

@Injectable()
export class GmailClient {
  private readonly logger = new Logger(GmailClient.name);
  private readonly circuitBreaker = getProviderCircuitBreaker('GOOGLE');

  constructor(private readonly configService: ConfigService) {}

  createClient(accessToken: string, refreshToken?: string) {
    const oauth2Client = new google.auth.OAuth2(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  async fetchMessages(
    accessToken: string,
    refreshToken: string | undefined,
    query: string,
    limit: number,
  ): Promise<EmailSummary[]> {
    try {
      const gmail = this.createClient(accessToken, refreshToken);

      const listResponse = await this.circuitBreaker.execute(
        () =>
          withTimeout(
            () =>
              gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: limit,
              }),
            resolveIntegrationTimeoutMs(),
            'Gmail messages list',
          ),
        {
          onOpen: () => IntegrationProviderError.unavailable('GOOGLE'),
          // A single user's expired/invalid token (401) must not trip the
          // shared provider circuit for everyone else.
          isFailure: (error) => !this.isUnauthorizedError(error),
        },
      );

      const messageIds = (listResponse.data.messages || []).filter(
        (msg): msg is { id: string } => !!msg.id,
      );

      const results = await Promise.all(
        messageIds.map(async (msg): Promise<EmailSummary | null> => {
          try {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            });

            const headers = detail.data.payload?.headers || [];

            return {
              id: msg.id,
              threadId: detail.data.threadId || undefined,
              from: headers.find((h) => h.name === 'From')?.value || '',
              subject:
                headers.find((h) => h.name === 'Subject')?.value ||
                '(no subject)',
              snippet: detail.data.snippet || '',
              receivedAt: headers.find((h) => h.name === 'Date')?.value || '',
            };
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : 'Unknown Gmail message error';
            this.logger.warn(`Failed to fetch message ${msg.id}: ${message}`);
            return null;
          }
        }),
      );

      return results.filter((e): e is NonNullable<typeof e> => e !== null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gmail API error';
      this.logger.error('Failed to fetch messages', message);
      throw IntegrationProviderError.unavailable('GOOGLE');
    }
  }

  async getMessageDetails(
    messageId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<EmailDetail | null> {
    try {
      const gmail = this.createClient(accessToken, refreshToken);
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const headers = detail.data.payload?.headers || [];
      const from = headers.find((h) => h.name === 'From')?.value || '';
      const subject =
        headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
      const date = headers.find((h) => h.name === 'Date')?.value || '';
      const snippet = detail.data.snippet || '';
      const body =
        this.extractMessageBody(detail.data.payload) ||
        snippet ||
        '(empty body)';

      return { id: messageId, from, subject, snippet, receivedAt: date, body };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gmail message error';
      this.logger.warn(
        `Failed to fetch Gmail message ${messageId}: ${message}`,
      );
      return null;
    }
  }

  async createDraft(
    accessToken: string,
    refreshToken: string | undefined,
    options: { to: string; subject: string; body: string },
  ): Promise<string | null> {
    try {
      const gmail = this.createClient(accessToken, refreshToken);
      const rawMessage = Buffer.from(
        [
          `To: ${options.to}`,
          `Subject: ${options.subject}`,
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          options.body,
        ].join('\r\n'),
      )
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const normalizedRawMessage = this.trimTrailingEquals(rawMessage);

      const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: normalizedRawMessage,
          },
        },
      });

      return response.data.id || null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gmail draft error';
      this.logger.error('Failed to create Gmail draft', message);
      return null;
    }
  }

  private extractMessageBody(payload: GmailMessagePart | undefined): string {
    if (!payload) {
      return '';
    }

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return this.decodeBase64Url(payload.body.data);
    }

    const parts = Array.isArray(payload.parts) ? payload.parts : [];
    for (const part of parts) {
      const partBody = this.extractMessageBody(part);
      if (partBody) {
        return partBody;
      }
    }

    if (payload.body?.data) {
      return this.decodeBase64Url(payload.body.data);
    }

    return '';
  }

  private decodeBase64Url(value: string): string {
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      .toString('utf8')
      .trim();
  }

  private trimTrailingEquals(value: string): string {
    let end = value.length;
    while (end > 0 && value[end - 1] === '=') {
      end -= 1;
    }
    return value.slice(0, end);
  }

  private isUnauthorizedError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const gaxiosLike = error as {
      code?: number;
      status?: number;
      response?: { status?: number };
    };

    return (
      gaxiosLike.code === 401 ||
      gaxiosLike.status === 401 ||
      gaxiosLike.response?.status === 401
    );
  }
}
