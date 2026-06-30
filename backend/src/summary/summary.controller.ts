import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SummaryService } from './summary.service';

interface SummaryRequest {
  user: {
    id: string;
  };
}

@Controller('summary')
@UseGuards(JwtAuthGuard)
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Post('generate')
  async generateSummary(@Req() req: SummaryRequest): Promise<unknown> {
    return this.summaryService.generateSummaryForUser(req.user.id);
  }
}
