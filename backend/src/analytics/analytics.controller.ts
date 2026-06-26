import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from './analytics.service';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly aiService: AiService,
  ) {}

  @Get('weekly-stats')
  async getWeeklyStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.analyticsService.getWeeklyStats(req.user.id);
    const audit = await this.aiService.generateTimeAudit(stats);
    return { ...stats, audit };
  }
}
