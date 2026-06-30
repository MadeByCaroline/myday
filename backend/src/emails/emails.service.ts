import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { google } from 'googleapis';
import { AiService } from '../ai/ai.service';
import type { CalendarEvent } from '../calendar/calendar.service';
import { CalendarService } from '../calendar/calendar.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

interface RefreshedOAuthToken {
  accessToken: string;
  refreshToken?: string;
}

interface MicrosoftRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
}

interface AccountContext {
  provider: string;
  accessToken: string;
  refreshToken?: string;
}

type OAuthTokenRecord = Awaited<
  ReturnType<PrismaService['oAuthToken']['findMany']>
>[number];

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);
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
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly calendarService: CalendarService,
    private readonly microsoftService: MicrosoftService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {}

  async createDraft(userId: string, messageId: string, action: string) {
    const normalizedAction = action.trim();
    if (!normalizedAction) {
      throw new BadRequestException(
        'An action is required to generate a draft.',
      );
    }

    const oauthTokens = await this.usersService.getOAuthTokens(userId);
    if (oauthTokens.length === 0) {
      throw new NotFoundException('No connected email account was found.');
    }

    const accountContexts = await Promise.all(
      oauthTokens.map((oauthToken) => this.getAccountContext(oauthToken)),
    );
    const { start, end } = this.getRelevantTimeRange(normalizedAction);
    const events = await this.collectCalendarEvents(
      accountContexts,
      start,
      end,
    );

    for (const account of accountContexts) {
      if (account.provider === 'GOOGLE') {
        const email = await this.mailService.getEmailById(
          messageId,
          account.accessToken,
          account.refreshToken,
        );
        if (!email) {
          continue;
        }

        const draftBody = await this.aiService.generateDraftReply({
          email,
          action: normalizedAction,
          events,
        });
        const draftId = await this.mailService.createDraft(
          account.accessToken,
          account.refreshToken,
          {
            to: this.extractEmailAddress(email.from),
            subject: this.buildReplySubject(email.subject),
            body: draftBody,
          },
        );

        if (!draftId) {
          throw new BadRequestException('Failed to create the Gmail draft.');
        }

        return { draftId, provider: 'GOOGLE' };
      }

      if (account.provider === 'MICROSOFT') {
        const email = await this.microsoftService.getEmailById(
          account.accessToken,
          messageId,
        );
        if (!email) {
          continue;
        }

        const draftBody = await this.aiService.generateDraftReply({
          email,
          action: normalizedAction,
          events,
        });
        const draftId = await this.microsoftService.createDraft(
          account.accessToken,
          {
            to: this.extractEmailAddress(email.from),
            subject: this.buildReplySubject(email.subject),
            body: draftBody,
          },
        );

        if (!draftId) {
          throw new BadRequestException('Failed to create the Outlook draft.');
        }

        return { draftId, provider: 'MICROSOFT' };
      }
    }

    throw new NotFoundException(
      'The requested email could not be found in the connected mailboxes.',
    );
  }

  private async collectCalendarEvents(
    accounts: AccountContext[],
    start: Date,
    end: Date,
  ): Promise<CalendarEvent[]> {
    const eventResults = await Promise.allSettled(
      accounts.map(async (account) => {
        if (account.provider === 'GOOGLE') {
          return this.calendarService.getEventsForRange(
            account.accessToken,
            account.refreshToken,
            start,
            end,
          );
        }

        if (account.provider === 'MICROSOFT') {
          const events = await this.microsoftService.getEventsForRange(
            account.accessToken,
            account.refreshToken,
            start,
            end,
          );
          return events.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            location: event.location,
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
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }

  private getRelevantTimeRange(action: string): { start: Date; end: Date } {
    const now = new Date();
    const normalizedAction = action.toLowerCase();
    const dayAliases = [
      ['sunday', 'dimanche'],
      ['monday', 'lundi'],
      ['tuesday', 'mardi'],
      ['wednesday', 'mercredi'],
      ['thursday', 'jeudi'],
      ['friday', 'vendredi'],
      ['saturday', 'samedi'],
    ];

    let targetDate: Date | null = null;
    if (
      normalizedAction.includes('today') ||
      normalizedAction.includes("aujourd'hui")
    ) {
      targetDate = now;
    } else if (
      normalizedAction.includes('tomorrow') ||
      normalizedAction.includes('demain')
    ) {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + 1);
    } else {
      const matchingDayIndex = dayAliases.findIndex((aliases) =>
        aliases.some((alias) => normalizedAction.includes(alias)),
      );
      if (matchingDayIndex >= 0) {
        targetDate = new Date(now);
        const currentDay = now.getDay();
        // Named weekdays default to the next occurrence. If the action says the
        // current weekday by name (for example "Monday" on a Monday), we treat
        // it as next week's occurrence; explicit "today" is handled earlier.
        const dayOffset =
          matchingDayIndex === currentDay
            ? 7
            : (matchingDayIndex - currentDay + 7) % 7;
        targetDate.setDate(now.getDate() + dayOffset);
      }
    }

    if (!targetDate) {
      return {
        start: now,
        end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      };
    }

    return {
      start: new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        0,
        0,
        0,
      ),
      end: new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        23,
        59,
        59,
      ),
    };
  }

  private async getAccountContext(
    oauthToken: OAuthTokenRecord,
  ): Promise<AccountContext> {
    const provider = oauthToken.provider.toUpperCase();

    if (provider === 'GOOGLE') {
      const token = await this.getUsableGoogleToken(oauthToken);
      return { provider, ...token };
    }

    if (provider === 'MICROSOFT') {
      const token = await this.getUsableMicrosoftToken(oauthToken);
      return { provider, ...token };
    }

    return {
      provider,
      accessToken: oauthToken.accessToken,
      refreshToken: oauthToken.refreshToken || undefined,
    };
  }

  private extractEmailAddress(value: string): string {
    const match = value.match(/<([^>]+)>/u);
    const candidate = (match?.[1] || value).trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(candidate)) {
      return candidate;
    }

    const fallback = value.trim();
    this.logger.warn(
      `Unable to confidently parse email address from: ${fallback}`,
    );
    return fallback;
  }

  private buildReplySubject(subject: string): string {
    return /^re:/iu.test(subject) ? subject : `Re: ${subject}`;
  }

  private async getUsableGoogleToken(
    oauthToken: OAuthTokenRecord,
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
    oauthToken: OAuthTokenRecord,
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
        scope: EmailsService.MICROSOFT_SCOPES,
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

  private shouldRefreshToken(oauthToken: OAuthTokenRecord) {
    if (!oauthToken.expiresAt) {
      return false;
    }

    return oauthToken.expiresAt.getTime() <= Date.now() + 60_000;
  }
}
