import type { OAuthToken } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { google } from 'googleapis';
import { AiService } from '../ai/ai.service';
import type { CalendarEvent } from '../calendar/calendar.service';
import { CalendarService } from '../calendar/calendar.service';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import { MicrosoftService } from '../integrations/microsoft.service';
import type { EmailSummary } from '../mail/mail.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

interface RefreshedOAuthToken {
  accessToken: string;
  refreshToken?: string;
}

interface MicrosoftRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
}

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly calendarService: CalendarService,
    private readonly microsoftService: MicrosoftService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async generateDailySummariesForAllUsers() {
    const users = await this.prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      try {
        await this.generateSummaryForUser(user.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown summary error';
        this.logger.error(
          `Failed to generate daily summary for user ${user.id}`,
          message,
        );
      }
    }
  }

  async generateSummaryForUser(userId: string) {
    const oauthTokens = await this.prisma.oAuthToken.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    if (oauthTokens.length === 0) {
      return {
        error:
          'No OAuth token found. Please connect a Google or Outlook account.',
      };
    }

    this.logger.log(
      'Connected providers for user: ' +
        oauthTokens.map((token) => token.provider).join(', '),
    );

    const [accountData, userSettings] = await Promise.all([
      Promise.allSettled(
        oauthTokens.map((oauthToken) => this.fetchAccountData(oauthToken)),
      ),
      this.settingsService.getSettings(userId),
    ]);

    const successfulData = accountData
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          provider: string;
          emails: EmailSummary[];
          events: CalendarEvent[];
        }> => result.status === 'fulfilled',
      )
      .map((result) => result.value);

    accountData
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      .forEach((result) => {
        this.logger.warn(
          `Skipping an OAuth account due to fetch failure: ${String(result.reason)}`,
        );
      });

    const allEmails = successfulData.flatMap((data) => data.emails);
    const filteredEmails = this.filterExcludedSenders(
      allEmails,
      userSettings.excludedSenders,
    );

    const googleEmailCount = successfulData
      .filter((d) => d.provider === 'GOOGLE')
      .flatMap((d) => d.emails).length;
    const microsoftEmailCount = successfulData
      .filter((d) => d.provider === 'MICROSOFT')
      .flatMap((d) => d.emails).length;

    this.logger.log(
      `Aggregated Data -> Google Emails: ${googleEmailCount} | Microsoft Emails: ${microsoftEmailCount} | After filter: ${filteredEmails.length}`,
    );

    const analysis = await this.aiService.analyzeProductivityData(
      filteredEmails,
      successfulData.flatMap((data) => data.events),
      userSettings.aiSummaryInstructions,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { dailySummary: analysis.summary },
    });

    return analysis;
  }

  private filterExcludedSenders(
    emails: EmailSummary[],
    excludedSenders: string[],
  ): EmailSummary[] {
    if (excludedSenders.length === 0) {
      return emails;
    }
    const lowerExcluded = excludedSenders.map((s) => s.toLowerCase());
    return emails.filter((email) => {
      const from = email.from.toLowerCase();
      return !lowerExcluded.some((excluded) => from.includes(excluded));
    });
  }

  private async fetchAccountData(oauthToken: OAuthToken) {
    const provider = oauthToken.provider.toUpperCase();

    if (provider === 'GOOGLE') {
      const token = await this.getUsableGoogleToken(oauthToken);
      const [emails, events] = await Promise.all([
        this.mailService.getRecentEmails(token.accessToken, token.refreshToken),
        this.calendarService.getTodayEvents(
          token.accessToken,
          token.refreshToken,
        ),
      ]);
      return { provider, emails, events };
    }

    if (provider === 'MICROSOFT') {
      const token = await this.getUsableMicrosoftToken(oauthToken);
      const [emails, events] = await Promise.all([
        this.microsoftService.getUnreadEmails(token.accessToken),
        this.microsoftService.getTodayEvents(token.accessToken),
      ]);
      return {
        provider,
        emails,
        events: events.map((event) =>
          this.mapUnifiedEventToCalendarEvent(event),
        ),
      };
    }

    this.logger.warn(
      `Skipping unsupported OAuth provider: ${oauthToken.provider}`,
    );
    return { provider, emails: [], events: [] };
  }

  private async getUsableGoogleToken(
    oauthToken: OAuthToken,
  ): Promise<RefreshedOAuthToken> {
    if (!this.shouldRefreshToken(oauthToken) || !oauthToken.refreshToken) {
      return {
        accessToken: oauthToken.accessToken,
        refreshToken: oauthToken.refreshToken || undefined,
      };
    }

    const oauth2Client = new google.auth.OAuth2(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      refresh_token: oauthToken.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    const accessToken = credentials.access_token || oauthToken.accessToken;
    const refreshToken = credentials.refresh_token || oauthToken.refreshToken;
    const expiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : oauthToken.expiresAt;

    await this.prisma.oAuthToken.update({
      where: { id: oauthToken.id },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: refreshToken || undefined };
  }

  private async getUsableMicrosoftToken(
    oauthToken: OAuthToken,
  ): Promise<RefreshedOAuthToken> {
    if (!this.shouldRefreshToken(oauthToken) || !oauthToken.refreshToken) {
      return {
        accessToken: oauthToken.accessToken,
        refreshToken: oauthToken.refreshToken || undefined,
      };
    }

    const response = await axios.post<MicrosoftRefreshResponse>(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: this.configService.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
        client_secret: this.configService.getOrThrow<string>(
          'MICROSOFT_CLIENT_SECRET',
        ),
        grant_type: 'refresh_token',
        refresh_token: oauthToken.refreshToken,
        scope: SummaryService.MICROSOFT_SCOPES,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const accessToken = response.data.access_token || oauthToken.accessToken;
    const refreshToken = response.data.refresh_token || oauthToken.refreshToken;
    const expiresInSeconds = Number(response.data.expires_in);
    const expiresAt = Number.isFinite(expiresInSeconds)
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : oauthToken.expiresAt;

    await this.prisma.oAuthToken.update({
      where: { id: oauthToken.id },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: refreshToken || undefined };
  }

  private shouldRefreshToken(oauthToken: OAuthToken) {
    if (!oauthToken.expiresAt) {
      return false;
    }

    return oauthToken.expiresAt.getTime() <= Date.now() + 60_000;
  }

  private mapUnifiedEventToCalendarEvent(event: UnifiedEvent): CalendarEvent {
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location,
    };
  }
}
