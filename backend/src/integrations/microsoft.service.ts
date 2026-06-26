import { Injectable, Logger } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import type { EmailSummary } from '../mail/mail.service';

interface MicrosoftMessageResponse {
  value?: Array<{
    id?: string;
    bodyPreview?: string;
    from?: {
      emailAddress?: {
        address?: string;
      };
    };
    receivedDateTime?: string;
    subject?: string;
  }>;
}

interface MicrosoftCalendarViewResponse {
  value?: Array<{
    id?: string;
    subject?: string;
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
    location?: { displayName?: string };
    onlineMeeting?: { joinUrl?: string };
    webLink?: string;
  }>;
}

@Injectable()
export class MicrosoftService {
  private readonly logger = new Logger(MicrosoftService.name);

  async getUnreadEmails(accessToken: string): Promise<EmailSummary[]> {
    this.logger.log('Fetching Microsoft emails...');
    try {
      const response = await axios.get<MicrosoftMessageResponse>(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages',
        {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
          params: {
            $filter: 'isRead eq false',
            $top: 15,
          },
        },
      );

      this.logger.log(
        `Microsoft returned ${response.data.value?.length || 0} emails.`,
      );

      return (response.data.value || []).map((message) => ({
        id: message.id || '',
        from: message.from?.emailAddress?.address || '',
        subject: message.subject || '(no subject)',
        snippet: message.bodyPreview || '',
        receivedAt: message.receivedDateTime || '',
      }));
    } catch (error) {
      const detail = isAxiosError(error)
        ? (error.response?.data ?? error.message)
        : error instanceof Error
          ? error.message
          : 'Unknown Microsoft Graph API error';
      this.logger.error('Microsoft Graph Error:', detail);
      return [];
    }
  }

  async getTodayEvents(accessToken: string): Promise<UnifiedEvent[]> {
    this.logger.log("Fetching Microsoft today's calendar events...");
    try {
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
      );
      const endOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
      );

      const response = await axios.get<MicrosoftCalendarViewResponse>(
        'https://graph.microsoft.com/v1.0/me/calendar/calendarView',
        {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
          params: {
            startDateTime: startOfDay.toISOString(),
            endDateTime: endOfDay.toISOString(),
            $top: 50,
            $orderby: 'start/dateTime',
          },
        },
      );

      this.logger.log(
        `Microsoft returned ${response.data.value?.length || 0} calendar events.`,
      );

      return (response.data.value || []).map((event) => ({
        id: event.id || '',
        title: event.subject || '(no title)',
        start: event.start?.dateTime || '',
        end: event.end?.dateTime || '',
        provider: 'MICROSOFT',
        location: event.location?.displayName || undefined,
        link: event.onlineMeeting?.joinUrl || event.webLink || undefined,
      }));
    } catch (error) {
      const detail = isAxiosError(error)
        ? (error.response?.data ?? error.message)
        : error instanceof Error
          ? error.message
          : 'Unknown Microsoft Graph API error';
      this.logger.error('Microsoft Graph Calendar Error:', detail);
      return [];
    }
  }
}
