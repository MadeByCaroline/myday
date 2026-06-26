import { Injectable, Logger } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import type { EmailDetail, EmailSummary } from '../mail/mail.service';

interface MicrosoftMessageResponse {
  value?: Array<{
    id?: string;
    bodyPreview?: string;
    body?: {
      content?: string;
    };
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
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Error:', detail);
      return [];
    }
  }

  async getTodayEvents(accessToken: string): Promise<UnifiedEvent[]> {
    const now = new Date();
    return this.getEventsForRange(
      accessToken,
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
    );
  }

  async getEventsForRange(
    accessToken: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedEvent[]> {
    this.logger.log("Fetching Microsoft today's calendar events...");
    try {
      const response = await axios.get<MicrosoftCalendarViewResponse>(
        'https://graph.microsoft.com/v1.0/me/calendar/calendarView',
        {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
          params: {
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
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
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Calendar Error:', detail);
      return [];
    }
  }

  async getEmailById(
    accessToken: string,
    messageId: string,
  ): Promise<EmailDetail | null> {
    try {
      const safeMessageId = encodeURIComponent(messageId);
      const response = await axios.get<{
        id?: string;
        bodyPreview?: string;
        body?: { content?: string };
        from?: { emailAddress?: { address?: string } };
        receivedDateTime?: string;
        subject?: string;
      }>(`https://graph.microsoft.com/v1.0/me/messages/${safeMessageId}`, {
        headers: {
          Authorization: 'Bearer ' + accessToken,
        },
      });

      return {
        id: response.data.id || messageId,
        from: response.data.from?.emailAddress?.address || '',
        subject: response.data.subject || '(no subject)',
        snippet: response.data.bodyPreview || '',
        receivedAt: response.data.receivedDateTime || '',
        body:
          response.data.body?.content ||
          response.data.bodyPreview ||
          '(empty body)',
      };
    } catch (error) {
      const detail = this.getErrorDetail(error);
      this.logger.warn(
        `Microsoft message lookup failed for ${messageId}`,
        detail,
      );
      return null;
    }
  }

  async createDraft(
    accessToken: string,
    options: { to: string; subject: string; body: string },
  ): Promise<string | null> {
    try {
      const response = await axios.post<{ id?: string }>(
        'https://graph.microsoft.com/v1.0/me/messages',
        {
          subject: options.subject,
          body: {
            contentType: 'Text',
            content: options.body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: options.to,
              },
            },
          ],
        },
        {
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data.id || null;
    } catch (error) {
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Draft Error:', detail);
      return null;
    }
  }

  private getErrorDetail(error: unknown): string {
    if (isAxiosError(error)) {
      const data: unknown = error.response?.data;
      if (typeof data === 'string') {
        return data;
      }
      if (data) {
        try {
          return JSON.stringify(data);
        } catch {
          return '[unserializable error payload]';
        }
      }
      return error.message;
    }

    return error instanceof Error
      ? error.message
      : 'Unknown Microsoft Graph API error';
  }
}
