import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { UnifiedEvent } from '../calendar/unified-event.interface';

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  constructor(private configService: ConfigService) {}

  async getTodayEvents(
    accessToken: string,
    refreshToken?: string,
  ): Promise<UnifiedEvent[]> {
    try {
      const oauth2Client = this.createOAuthClient(accessToken, refreshToken);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
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

      const [{ data: colorsData }, { data: eventsData }] = await Promise.all([
        calendar.colors.get(),
        calendar.events.list({
          calendarId: 'primary',
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50,
        }),
      ]);
      const colorCount = Object.keys(colorsData.event || {}).length;
      this.logger.debug(`Loaded ${colorCount} Google event colors`);

      return (eventsData.items || []).map((event) => {
        const defaultLink =
          event.hangoutLink ||
          event.htmlLink ||
          event.conferenceData?.entryPoints?.find((entryPoint) => entryPoint.uri)
            ?.uri;

        return {
          id: event.id || '',
          title: event.summary || '(no title)',
          start: event.start?.dateTime || event.start?.date || '',
          end: event.end?.dateTime || event.end?.date || '',
          provider: 'GOOGLE',
          location: event.location || undefined,
          link: defaultLink || undefined,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Google Calendar error';
      this.logger.error('Failed to fetch Google calendar events', message);
      return [];
    }
  }

  async createBusyEvent(
    accessToken: string,
    refreshToken: string | undefined,
    start: Date,
    end: Date,
    description: string,
  ): Promise<string | null> {
    try {
      const oauth2Client = this.createOAuthClient(accessToken, refreshToken);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: 'Deep Work',
          description,
          start: {
            dateTime: start.toISOString(),
          },
          end: {
            dateTime: end.toISOString(),
          },
          transparency: 'opaque',
          visibility: 'private',
        },
      });

      return response.data.id || null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Google Calendar error';
      this.logger.error('Failed to create Google deep work event', message);
      return null;
    }
  }

  async deleteBusyEvent(
    accessToken: string,
    refreshToken: string | undefined,
    eventId: string,
  ) {
    try {
      const oauth2Client = this.createOAuthClient(accessToken, refreshToken);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Google Calendar error';
      this.logger.error('Failed to delete Google deep work event', message);
    }
  }

  private createOAuthClient(accessToken: string, refreshToken?: string) {
    const oauth2Client = new google.auth.OAuth2(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return oauth2Client;
  }
}
