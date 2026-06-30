import { Injectable } from '@nestjs/common';
import type { EmailAccount, Prisma } from '@prisma/client';
import { ImapFlow } from 'imapflow';
import type { CalendarEvent } from '../calendar/calendar.service';
import type { EmailDetail, EmailSummary } from '../mail/mail.service';
import type { EmailProvider } from './email-provider.interface';

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

@Injectable()
export class ImapAdapter implements EmailProvider {
  supports(account: EmailAccount): boolean {
    return account.provider === 'IMAP';
  }

  async fetchEmails(account: EmailAccount): Promise<EmailSummary[]> {
    const config = this.getConfig(account.imapConfig);
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });

    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
      const unreadUids = await client.search({ seen: false });
      const allUids = await client.search({ all: true });
      const normalizedUnread = Array.isArray(unreadUids) ? unreadUids : [];
      const normalizedAll = Array.isArray(allUids) ? allUids : [];
      const selected = (normalizedUnread.length > 0 ? normalizedUnread : normalizedAll)
        .slice(-10)
        .reverse();

      const summaries: EmailSummary[] = [];
      for await (const message of client.fetch(selected, {
        uid: true,
        envelope: true,
        source: true,
      })) {
        const from = message.envelope?.from?.[0]?.address || '';
        const subject = message.envelope?.subject || '(no subject)';
        const receivedAt =
          message.envelope?.date?.toISOString() || new Date().toISOString();
        const source = message.source?.toString() || '';
        summaries.push({
          id: String(message.uid || ''),
          from,
          subject,
          snippet: source.slice(0, 200),
          receivedAt,
        });
      }

      return summaries;
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  async fetchEvents(account: EmailAccount): Promise<CalendarEvent[]> {
    void account;
    return [];
  }

  async getEmailById(
    account: EmailAccount,
    messageId: string,
  ): Promise<EmailDetail | null> {
    void account;
    void messageId;
    return null;
  }

  async sendEmail(
    account: EmailAccount,
    options: { to: string; subject: string; body: string },
  ): Promise<string | null> {
    void account;
    void options;
    return null;
  }

  private getConfig(value: Prisma.JsonValue | null): ImapConfig {
    if (!value || typeof value !== 'object') {
      throw new Error('IMAP account is missing configuration.');
    }

    const maybeConfig = value as Partial<ImapConfig>;
    if (
      !maybeConfig.host ||
      !maybeConfig.port ||
      !maybeConfig.user ||
      !maybeConfig.password
    ) {
      throw new Error('IMAP configuration is incomplete.');
    }

    return {
      host: maybeConfig.host,
      port: Number(maybeConfig.port),
      secure: Boolean(maybeConfig.secure),
      user: maybeConfig.user,
      password: maybeConfig.password,
    };
  }
}
