import type { EmailAccount } from '@prisma/client';
import type { CalendarEvent } from '../calendar/calendar.service';
import type { EmailDetail, EmailSummary } from '../mail/mail.service';

export interface EmailProvider {
  supports(account: EmailAccount): boolean;
  fetchEmails(account: EmailAccount): Promise<EmailSummary[]>;
  fetchEvents(account: EmailAccount): Promise<CalendarEvent[]>;
  getEmailById(
    account: EmailAccount,
    messageId: string,
  ): Promise<EmailDetail | null>;
  sendEmail(
    account: EmailAccount,
    options: { to: string; subject: string; body: string },
  ): Promise<string | null>;
}
