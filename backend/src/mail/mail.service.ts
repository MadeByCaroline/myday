import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export interface EmailSummary {
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {}

  async getRecentEmails(accessToken: string, refreshToken?: string): Promise<EmailSummary[]> {
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
          const from = headers.find((header) => header.name === 'From')?.value || '';
          const subject = headers.find((header) => header.name === 'Subject')?.value || '(no subject)';
          const date = headers.find((header) => header.name === 'Date')?.value || '';
          const snippet = detail.data.snippet || '';

          emails.push({ from, subject, snippet, receivedAt: date });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown Gmail message error';
          this.logger.warn(`Failed to fetch message ${msg.id}: ${message}`);
        }
      }

      return emails;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Gmail API error';
      this.logger.error('Failed to fetch emails', message);
      return [];
    }
  }
}
