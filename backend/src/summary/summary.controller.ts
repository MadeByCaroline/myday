import { Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import type { CalendarEvent } from '../calendar/calendar.service';
import { CalendarService } from '../calendar/calendar.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import type { EmailSummary } from '../mail/mail.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';

interface SummaryRequest {
  user: {
    id: string;
  };
}

@Controller('summary')
@UseGuards(JwtAuthGuard)
export class SummaryController {
  private readonly logger = new Logger(SummaryController.name);

  constructor(
    private mailService: MailService,
    private calendarService: CalendarService,
    private microsoftService: MicrosoftService,
    private aiService: AiService,
    private usersService: UsersService,
  ) {}

  @Post('generate')
  async generateSummary(@Req() req: SummaryRequest) {
    const oauthTokens = await this.usersService.getOAuthTokens(req.user.id);
    if (oauthTokens.length === 0) {
      return {
        error:
          'No OAuth token found. Please connect a Google or Outlook account.',
      };
    }

    this.logger.log(
      'Connected providers for user: ' +
        oauthTokens.map((t) => t.provider).join(', '),
    );

    const accountData = await Promise.allSettled(
      oauthTokens.map(async (oauthToken) => {
        const provider = oauthToken.provider.toUpperCase();

        if (provider === 'GOOGLE') {
          const [emails, events] = await Promise.all([
            this.mailService.getRecentEmails(
              oauthToken.accessToken,
              oauthToken.refreshToken || undefined,
            ),
            this.calendarService.getTodayEvents(
              oauthToken.accessToken,
              oauthToken.refreshToken || undefined,
            ),
          ]);
          return { provider, emails, events };
        }

        if (provider === 'MICROSOFT') {
          const emails = await this.microsoftService.getUnreadEmails(
            oauthToken.accessToken,
          );
          return { provider, emails, events: [] };
        }

        this.logger.warn(
          `Skipping unsupported OAuth provider: ${oauthToken.provider}`,
        );
        return { provider, emails: [], events: [] };
      }),
    );

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

    const googleEmails = successfulData
      .filter((d) => d.provider === 'GOOGLE')
      .flatMap((d) => d.emails);
    const microsoftEmails = successfulData
      .filter((d) => d.provider === 'MICROSOFT')
      .flatMap((d) => d.emails);

    this.logger.log(
      `Aggregated Data -> Google Emails: ${googleEmails.length} | Microsoft Emails: ${microsoftEmails.length}`,
    );

    const emails = successfulData.flatMap((data) => data.emails);
    const events = successfulData.flatMap((data) => data.events);

    return this.aiService.analyzeProductivityData(emails, events);
  }
}
