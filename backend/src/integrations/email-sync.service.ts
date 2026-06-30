import { Injectable } from '@nestjs/common';
import type { EmailAccount } from '@prisma/client';
import {
  IntegrationProviderError,
  isIntegrationProviderError,
} from './integration-provider.error';
import { PrismaService } from '../prisma/prisma.service';
import type { CalendarEvent } from '../calendar/calendar.service';
import type { EmailSummary } from '../mail/mail.service';
import type { EmailProvider } from './email-provider.interface';
import { GmailAdapter } from './gmail.adapter';
import { MicrosoftAdapter } from './microsoft.adapter';
import { ImapAdapter } from './imap.adapter';

export interface SyncedEmailAccount {
  account: EmailAccount;
  status: 'ready' | 'error';
  code?: 'needs_reauth' | 'provider_unavailable';
  message?: string;
  emails: EmailSummary[];
  events: CalendarEvent[];
}

@Injectable()
export class EmailSyncService {
  private readonly adapters: EmailProvider[];

  constructor(
    private readonly prisma: PrismaService,
    gmailAdapter: GmailAdapter,
    microsoftAdapter: MicrosoftAdapter,
    imapAdapter: ImapAdapter,
  ) {
    this.adapters = [gmailAdapter, microsoftAdapter, imapAdapter];
  }

  async syncForUser(userId: string): Promise<SyncedEmailAccount[]> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    const results = await Promise.allSettled(
      accounts.map((account) => this.syncAccount(account)),
    );

    return results.map((result, index) => {
      const account = accounts[index];
      if (result.status === 'fulfilled') {
        return result.value;
      }

      const error = this.normalizeError(account.provider, result.reason);
      return {
        account,
        status: 'error' as const,
        code: error.code,
        message: error.message,
        emails: [],
        events: [],
      };
    });
  }

  private async syncAccount(account: EmailAccount): Promise<SyncedEmailAccount> {
    const adapter = this.adapters.find((candidate) => candidate.supports(account));
    if (!adapter) {
      throw IntegrationProviderError.unavailable(account.provider);
    }

    const [emails, events] = await Promise.all([
      adapter.fetchEmails(account),
      adapter.fetchEvents(account),
    ]);

    return {
      account,
      status: 'ready',
      emails,
      events,
    };
  }

  private normalizeError(provider: string, error: unknown) {
    if (isIntegrationProviderError(error)) {
      return error;
    }

    return IntegrationProviderError.unavailable(provider);
  }
}
