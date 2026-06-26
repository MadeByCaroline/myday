import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  attendees?: string[];
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private configService: ConfigService) {}

  async getTodayEvents(
    accessToken: string,
    refreshToken?: string,
  ): Promise<CalendarEvent[]> {
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
  ): Promise<CalendarEvent[]> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
        this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20,
      });

      return (response.data.items || []).map((event) => ({
        id: event.id || '',
        title: event.summary || '(no title)',
        start: event.start?.dateTime || event.start?.date || '',
        end: event.end?.dateTime || event.end?.date || '',
        location: event.location || undefined,
        description: event.description || undefined,
        attendees: (event.attendees || [])
          .map((attendee) => attendee.email)
          .filter(Boolean) as string[],
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Calendar API error';
      this.logger.error('Failed to fetch calendar events', message);
      return [];
    }
  }
}
