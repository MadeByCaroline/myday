import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import type { EmailDetail, EmailSummary } from '../mail/mail.service';
import { IntegrationProviderError } from './integration-provider.error';
import {
  getProviderCircuitBreaker,
  resolveIntegrationTimeoutMs,
  withTimeout,
} from './resilience';

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
  private static readonly MICROSOFT_SCOPES = [
    'openid',
    'profile',
    'email',
    'user.read',
    'mail.read',
    'Mail.ReadWrite',
    'Calendars.Read',
    'offline_access',
  ].join(' ');

  constructor(private readonly configService: ConfigService) {}

  private readonly circuitBreaker = getProviderCircuitBreaker('MICROSOFT');

  /**
   * Execute an outgoing Microsoft Graph read behind a strict timeout and the
   * shared circuit breaker so latency or outages cannot block the event loop.
   */
  private async runResilient<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.circuitBreaker.execute(
      () => withTimeout(operation, resolveIntegrationTimeoutMs(), label),
      {
        onOpen: () => IntegrationProviderError.unavailable('MICROSOFT'),
        isFailure: (error) =>
          !(
            error instanceof IntegrationProviderError &&
            error.code === 'needs_reauth'
          ),
      },
    );
  }

  async getUnreadEmails(
    accessToken: string,
    refreshToken?: string,
  ): Promise<EmailSummary[]> {
    this.logger.log('Fetching Microsoft emails...');
    try {
      const response = await this.runResilient('Microsoft inbox', () =>
        this.withAuthRetry(accessToken, refreshToken, (token) =>
          axios.get<MicrosoftMessageResponse>(
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages',
            {
              headers: {
                Authorization: 'Bearer ' + token,
              },
              params: {
                $filter: 'isRead eq false',
                $top: 15,
              },
              timeout: resolveIntegrationTimeoutMs(),
            },
          ),
        ),
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
      if (error instanceof IntegrationProviderError) {
        throw error;
      }
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Error:', detail);
      throw IntegrationProviderError.unavailable('MICROSOFT');
    }
  }

  async getTodayEvents(
    accessToken: string,
    refreshToken?: string,
  ): Promise<UnifiedEvent[]> {
    const now = new Date();
    return this.getEventsForRange(
      accessToken,
      refreshToken,
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
    );
  }

  async getEventsForRange(
    accessToken: string,
    refreshToken: string | undefined,
    start: Date,
    end: Date,
  ): Promise<UnifiedEvent[]> {
    this.logger.log("Fetching Microsoft today's calendar events...");
    try {
      const response = await this.runResilient('Microsoft calendar', () =>
        this.withAuthRetry(accessToken, refreshToken, (token) =>
          axios.get<MicrosoftCalendarViewResponse>(
            'https://graph.microsoft.com/v1.0/me/calendar/calendarView',
            {
              headers: {
                Authorization: 'Bearer ' + token,
              },
              params: {
                startDateTime: start.toISOString(),
                endDateTime: end.toISOString(),
                $top: 50,
                $orderby: 'start/dateTime',
              },
              timeout: resolveIntegrationTimeoutMs(),
            },
          ),
        ),
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
      if (error instanceof IntegrationProviderError) {
        throw error;
      }
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Calendar Error:', detail);
      throw IntegrationProviderError.unavailable('MICROSOFT');
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
        timeout: resolveIntegrationTimeoutMs(),
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
          timeout: resolveIntegrationTimeoutMs(),
        },
      );

      return response.data.id || null;
    } catch (error) {
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Draft Error:', detail);
      return null;
    }
  }

  async createBusyEvent(
    accessToken: string,
    start: Date,
    end: Date,
    description: string,
  ): Promise<string | null> {
    try {
      const response = await axios.post<{ id?: string }>(
        'https://graph.microsoft.com/v1.0/me/events',
        {
          subject: 'Deep Work',
          body: {
            contentType: 'Text',
            content: description,
          },
          start: {
            dateTime: start.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: end.toISOString(),
            timeZone: 'UTC',
          },
          showAs: 'busy',
          isReminderOn: false,
        },
        {
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
          timeout: resolveIntegrationTimeoutMs(),
        },
      );

      return response.data.id || null;
    } catch (error) {
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Deep Work Create Error:', detail);
      return null;
    }
  }

  async deleteBusyEvent(accessToken: string, eventId: string) {
    try {
      const safeEventId = encodeURIComponent(eventId);
      await axios.delete(
        `https://graph.microsoft.com/v1.0/me/events/${safeEventId}`,
        {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
          timeout: resolveIntegrationTimeoutMs(),
        },
      );
    } catch (error) {
      const detail = this.getErrorDetail(error);
      this.logger.error('Microsoft Graph Deep Work Delete Error:', detail);
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
          this.logger.warn('Unable to serialize Microsoft error payload');
          return '[unserializable error payload]';
        }
      }
      return error.message;
    }

    return error instanceof Error
      ? error.message
      : 'Unknown Microsoft Graph API error';
  }

  private async withAuthRetry<T>(
    accessToken: string,
    refreshToken: string | undefined,
    request: (token: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await request(accessToken);
    } catch (error) {
      if (!this.isUnauthorizedError(error)) {
        throw error;
      }

      if (!refreshToken) {
        throw IntegrationProviderError.needsReauth('MICROSOFT');
      }

      const refreshedToken = await this.refreshAccessToken(refreshToken);
      if (!refreshedToken) {
        throw IntegrationProviderError.needsReauth('MICROSOFT');
      }

      try {
        return await request(refreshedToken);
      } catch (retryError) {
        if (this.isUnauthorizedError(retryError)) {
          throw IntegrationProviderError.needsReauth('MICROSOFT');
        }
        throw retryError;
      }
    }
  }

  private async refreshAccessToken(
    refreshToken: string,
  ): Promise<string | undefined> {
    try {
      const response = await axios.post<{
        access_token?: string;
      }>(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: this.configService.getOrThrow<string>(
            'MICROSOFT_CLIENT_ID',
          ),
          client_secret: this.configService.getOrThrow<string>(
            'MICROSOFT_CLIENT_SECRET',
          ),
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: MicrosoftService.MICROSOFT_SCOPES,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: resolveIntegrationTimeoutMs(),
        },
      );

      return response.data.access_token;
    } catch (error) {
      const detail = this.getErrorDetail(error);
      this.logger.warn(
        `Microsoft token refresh failed, requiring reauth: ${detail}`,
      );
      throw IntegrationProviderError.needsReauth('MICROSOFT');
    }
  }

  private isUnauthorizedError(error: unknown): boolean {
    if (isAxiosError(error)) {
      return error.response?.status === 401;
    }

    if (error && typeof error === 'object') {
      const maybeError = error as { response?: { status?: number } };
      return maybeError.response?.status === 401;
    }

    return false;
  }
}
