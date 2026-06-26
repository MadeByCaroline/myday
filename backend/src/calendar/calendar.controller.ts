import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoogleService } from '../integrations/google.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import type { UnifiedEvent } from './unified-event.interface';
import { UsersService } from '../users/users.service';

interface CalendarRequest {
  user: {
    id: string;
  };
}

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(
    private usersService: UsersService,
    private googleService: GoogleService,
    private microsoftService: MicrosoftService,
  ) {}

  @Get('today')
  async getTodayCalendar(@Req() req: CalendarRequest): Promise<UnifiedEvent[]> {
    const oauthTokens = await this.usersService.getOAuthTokens(req.user.id);

    const eventResults = await Promise.allSettled(
      oauthTokens.map(async (oauthToken) => {
        const provider = oauthToken.provider.toUpperCase();

        if (provider === 'GOOGLE') {
          return this.googleService.getTodayEvents(
            oauthToken.accessToken,
            oauthToken.refreshToken || undefined,
          );
        }

        if (provider === 'MICROSOFT') {
          return this.microsoftService.getTodayEvents(oauthToken.accessToken);
        }

        return [] as UnifiedEvent[];
      }),
    );

    return eventResults
      .filter(
        (result): result is PromiseFulfilledResult<UnifiedEvent[]> =>
          result.status === 'fulfilled',
      )
      .flatMap((result) => result.value)
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }
}
