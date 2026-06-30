import { Injectable } from '@nestjs/common';
import {
  GmailClient,
  type EmailSummary,
  type EmailDetail,
} from '../integrations/gmail.client';

export type { EmailSummary, EmailDetail } from '../integrations/gmail.client';

@Injectable()
export class MailService {
  constructor(private readonly gmailClient: GmailClient) {}

  async getRecentEmails(
    accessToken: string,
    refreshToken?: string,
  ): Promise<EmailSummary[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const query = `after:${Math.floor(since.getTime() / 1000)} in:inbox`;
    return this.gmailClient.fetchMessages(accessToken, refreshToken, query, 10);
  }

  async getUnreadEmailsSince(
    accessToken: string,
    refreshToken?: string,
    hours = 12,
  ): Promise<EmailSummary[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const query = `after:${Math.floor(since.getTime() / 1000)} in:inbox is:unread`;
    return this.gmailClient.fetchMessages(accessToken, refreshToken, query, 10);
  }

  async getEmailById(
    messageId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<EmailDetail | null> {
    return this.gmailClient.getMessageDetails(
      messageId,
      accessToken,
      refreshToken,
    );
  }

  async createDraft(
    accessToken: string,
    refreshToken: string | undefined,
    options: { to: string; subject: string; body: string },
  ): Promise<string | null> {
    return this.gmailClient.createDraft(accessToken, refreshToken, options);
  }
}
