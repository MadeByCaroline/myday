import { Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import type { CalendarEvent } from '../calendar/calendar.service';
import { CalendarService } from '../calendar/calendar.service';
import type { EmailSummary } from '../mail/mail.service';
import { MailService } from '../mail/mail.service';
import { MicrosoftService } from '../integrations/microsoft.service';
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
    private aiService: AiService,
    private usersService: UsersService,
    private microsoftService: MicrosoftService,
  ) {}

  @Post('generate')
  async generateSummary(@Req() req: SummaryRequest) {
    const allTokens = await this.usersService.getAllOAuthTokens(req.user.id);
    if (allTokens.length === 0) {
      return {
        error: 'No OAuth token found. Please reconnect your Google account.',
      };
    }

    const googleTokens = allTokens.filter((t) => t.provider === 'google');
    const microsoftTokens = allTokens.filter((t) => t.provider === 'MICROSOFT');

    const googleResults = await Promise.allSettled(
      googleTokens.map(async (oauthToken) => {
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
        return { emails, events };
      }),
    );

    const microsoftResults = await Promise.allSettled(
      microsoftTokens.map(async (oauthToken) => {
        const emails = await this.microsoftService.getUnreadEmails(
          oauthToken.accessToken,
        );
        return { emails, events: [] as CalendarEvent[] };
      }),
    );

    const allResults = [...googleResults, ...microsoftResults];

    const successfulData = allResults
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          emails: EmailSummary[];
          events: CalendarEvent[];
        }> => result.status === 'fulfilled',
      )
      .map((result) => result.value);

    allResults
      .filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      )
      .forEach((result) => {
        this.logger.warn(
          `Skipping an account due to fetch failure: ${String(result.reason)}`,
        );
      });

    const emails = successfulData.flatMap((data) => data.emails);
    const events = successfulData.flatMap((data) => data.events);

    return this.aiService.analyzeProductivityData(emails, events);
  }
}
