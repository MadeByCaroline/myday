import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';

@Controller('summary')
@UseGuards(JwtAuthGuard)
export class SummaryController {
  constructor(
    private mailService: MailService,
    private calendarService: CalendarService,
    private aiService: AiService,
    private usersService: UsersService,
  ) {}

  @Post('generate')
  async generateSummary(@Req() req: any) {
    const oauthToken = await this.usersService.getOAuthToken(req.user.id, 'google');
    if (!oauthToken) {
      return { error: 'No OAuth token found. Please reconnect your Google account.' };
    }

    const [emails, events] = await Promise.all([
      this.mailService.getRecentEmails(oauthToken.accessToken, oauthToken.refreshToken || undefined),
      this.calendarService.getTodayEvents(oauthToken.accessToken, oauthToken.refreshToken || undefined),
    ]);

    return this.aiService.analyzeProductivityData(emails, events);
  }
}
