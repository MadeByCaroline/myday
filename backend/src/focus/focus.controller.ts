import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FocusService } from './focus.service';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

@Controller('focus')
@UseGuards(JwtAuthGuard)
export class FocusController {
  constructor(private readonly focusService: FocusService) {}

  @Post('start')
  async startDeepWork(
    @Req() req: AuthenticatedRequest,
    @Body() body: { durationMinutes: number },
  ) {
    return this.focusService.startDeepWork(req.user.id, body.durationMinutes);
  }

  @Post('stop')
  async stopDeepWork(@Req() req: AuthenticatedRequest) {
    return this.focusService.stopDeepWork(req.user.id);
  }

  @Get('current')
  getCurrentDeepWork(@Req() req: AuthenticatedRequest) {
    return this.focusService.getCurrentDeepWork(req.user.id);
  }
}
