import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { GoogleService } from '../integrations/google.service';
import { IntegrationProviderError } from '../integrations/integration-provider.error';
import { MicrosoftService } from '../integrations/microsoft.service';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  provider?: 'GOOGLE' | 'MICROSOFT';
  location?: string;
  description?: string;
  attendees?: string[];
  workspaceId?: string | null;
  workspaceName?: string | null;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly googleService: GoogleService,
    private readonly microsoftService: MicrosoftService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async getTodayWorkspaceEvents(userId: string): Promise<CalendarEvent[]> {
    const [oauthTokens, workspaces] = await Promise.all([
      this.usersService.getOAuthTokens(userId),
      this.workspacesService.listWorkspaces(userId),
    ]);
    const workspaceNames = new Map(
      workspaces.map((workspace) => [workspace.id, workspace.name]),
    );

    const eventResults = await Promise.allSettled(
      oauthTokens.map(async (oauthToken) => {
        const provider = oauthToken.provider.toUpperCase();
        const workspaceId = oauthToken.workspaceId ?? null;
        const workspaceName = workspaceId
          ? workspaceNames.get(workspaceId) ?? null
          : null;

        if (provider === 'GOOGLE') {
          const events = await this.googleService.getTodayEvents(
            oauthToken.accessToken,
            oauthToken.refreshToken || undefined,
          );

          return events.map((event) => ({
            ...event,
            workspaceId,
            workspaceName,
          }));
        }

        if (provider === 'MICROSOFT') {
          const events = await this.microsoftService.getTodayEvents(
            oauthToken.accessToken,
            oauthToken.refreshToken || undefined,
          );

          return events.map((event) => ({
            ...event,
            workspaceId,
            workspaceName,
          }));
        }

        return [] as CalendarEvent[];
      }),
    );

    return eventResults
      .filter(
        (result): result is PromiseFulfilledResult<CalendarEvent[]> =>
          result.status === 'fulfilled',
      )
      .flatMap((result) => result.value)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

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
        provider: 'GOOGLE',
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
      throw IntegrationProviderError.unavailable('GOOGLE');
    }
  }
}
