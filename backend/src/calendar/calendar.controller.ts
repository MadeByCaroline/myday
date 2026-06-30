import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CalendarEvent } from './calendar.service';
import { CalendarService } from './calendar.service';

interface CalendarRequest {
  user: {
    id: string;
  };
}

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('today')
  async getTodayCalendar(
    @Req() req: CalendarRequest,
  ): Promise<CalendarEvent[]> {
    return this.calendarService.getTodayWorkspaceEvents(req.user.id);
  }
}
