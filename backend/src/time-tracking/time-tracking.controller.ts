import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TimeTrackingService } from './time-tracking.service';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

@Controller('time')
@UseGuards(JwtAuthGuard)
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @Post('start/:taskId')
  async startTimer(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.timeTrackingService.startTimer(req.user.id, taskId);
  }

  @Post('stop/:entryId')
  async stopTimer(
    @Req() req: AuthenticatedRequest,
    @Param('entryId') entryId: string,
  ) {
    return this.timeTrackingService.stopTimer(req.user.id, entryId);
  }

  @Get('current')
  async getCurrentTimer(@Req() req: AuthenticatedRequest) {
    return this.timeTrackingService.getCurrentEntry(req.user.id);
  }
}
