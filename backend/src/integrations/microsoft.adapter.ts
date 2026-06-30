import { Injectable } from '@nestjs/common';
import type { EmailAccount } from '@prisma/client';
import type { CalendarEvent } from '../calendar/calendar.service';
import { MicrosoftService } from './microsoft.service';
import type { EmailProvider } from './email-provider.interface';

@Injectable()
export class MicrosoftAdapter implements EmailProvider {
  constructor(private readonly microsoftService: MicrosoftService) {}

  supports(account: EmailAccount): boolean {
    return account.provider === 'MICROSOFT';
  }

  async fetchEmails(account: EmailAccount) {
    return this.microsoftService.getUnreadEmails(
      account.accessToken || '',
      account.refreshToken || undefined,
    );
  }

  async fetchEvents(account: EmailAccount): Promise<CalendarEvent[]> {
    const events = await this.microsoftService.getTodayEvents(
      account.accessToken || '',
      account.refreshToken || undefined,
    );

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location,
    }));
  }

  async getEmailById(account: EmailAccount, messageId: string) {
    return this.microsoftService.getEmailById(
      account.accessToken || '',
      messageId,
    );
  }

  async sendEmail(
    account: EmailAccount,
    options: { to: string; subject: string; body: string },
  ) {
    return this.microsoftService.createDraft(
      account.accessToken || '',
      options,
    );
  }
}
