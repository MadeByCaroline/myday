import { Injectable } from '@nestjs/common';
import type { EmailAccount } from '@prisma/client';
import { CalendarService } from '../calendar/calendar.service';
import type { EmailProvider } from './email-provider.interface';
import { MailService } from '../mail/mail.service';

@Injectable()
export class GmailAdapter implements EmailProvider {
  constructor(
    private readonly mailService: MailService,
    private readonly calendarService: CalendarService,
  ) {}

  supports(account: EmailAccount): boolean {
    return account.provider === 'GOOGLE';
  }

  async fetchEmails(account: EmailAccount) {
    return this.mailService.getRecentEmails(
      account.accessToken || '',
      account.refreshToken || undefined,
    );
  }

  async fetchEvents(account: EmailAccount) {
    return this.calendarService.getTodayEvents(
      account.accessToken || '',
      account.refreshToken || undefined,
    );
  }

  async getEmailById(account: EmailAccount, messageId: string) {
    return this.mailService.getEmailById(
      messageId,
      account.accessToken || '',
      account.refreshToken || undefined,
    );
  }

  async sendEmail(
    account: EmailAccount,
    options: { to: string; subject: string; body: string },
  ) {
    return this.mailService.createDraft(
      account.accessToken || '',
      account.refreshToken || undefined,
      options,
    );
  }
}
