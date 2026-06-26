import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

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
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {}

  async getRecentEmails(
    accessToken: string,
    refreshToken?: string,
  ): Promise<EmailSummary[]> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
        this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const query = `after:${Math.floor(since.getTime() / 1000)} in:inbox`;

      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20,
      });

      const messages = listResponse.data.messages || [];
      const emails: EmailSummary[] = [];

      for (const msg of messages.slice(0, 10)) {
        if (!msg.id) {
          continue;
        }

        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          });

          const headers = detail.data.payload?.headers || [];
          const from =
            headers.find((header) => header.name === 'From')?.value || '';
          const subject =
            headers.find((header) => header.name === 'Subject')?.value ||
            '(no subject)';
          const date =
            headers.find((header) => header.name === 'Date')?.value || '';
          const snippet = detail.data.snippet || '';

          emails.push({ id: msg.id, threadId: detail.data.threadId || undefined, from, subject, snippet, receivedAt: date });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unknown Gmail message error';
          this.logger.warn(`Failed to fetch message ${msg.id}: ${message}`);
        }
      }

      return emails;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gmail API error';
      this.logger.error('Failed to fetch emails', message);
      return [];
    }
  }

  async getUnreadEmailsSince(
    accessToken: string,
    refreshToken?: string,
    hours = 12,
  ): Promise<EmailSummary[]> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
        this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const query = `after:${Math.floor(since.getTime() / 1000)} in:inbox is:unread`;

      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20,
      });

      const messages = listResponse.data.messages || [];
      const emails: EmailSummary[] = [];

      for (const msg of messages.slice(0, 10)) {
        if (!msg.id) {
          continue;
        }

        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          });

          const headers = detail.data.payload?.headers || [];
          const from =
            headers.find((header) => header.name === 'From')?.value || '';
          const subject =
            headers.find((header) => header.name === 'Subject')?.value ||
            '(no subject)';
          const date =
            headers.find((header) => header.name === 'Date')?.value || '';
          const snippet = detail.data.snippet || '';

          emails.push({ id: msg.id, threadId: detail.data.threadId || undefined, from, subject, snippet, receivedAt: date });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown Gmail message error';
          this.logger.warn(`Failed to fetch message ${msg.id}: ${message}`);
        }
      }

      return emails;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gmail API error';
      this.logger.error('Failed to fetch unread emails', message);
      return [];
    }
  }

  async getEmailById(
    messageId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<EmailDetail | null> {
    try {
      const gmail = this.createGmailClient(accessToken, refreshToken);
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const headers = detail.data.payload?.headers || [];
      const from =
        headers.find((header) => header.name === 'From')?.value || '';
      const subject =
        headers.find((header) => header.name === 'Subject')?.value ||
        '(no subject)';
      const date =
        headers.find((header) => header.name === 'Date')?.value || '';
      const snippet = detail.data.snippet || '';
      const body =
        this.extractMessageBody(detail.data.payload) ||
        snippet ||
        '(empty body)';

      return {
        id: messageId,
        from,
        subject,
        snippet,
        receivedAt: date,
        body,
      };
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
      const gmail = this.createGmailClient(accessToken, refreshToken);
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

  private createGmailClient(accessToken: string, refreshToken?: string) {
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
}
