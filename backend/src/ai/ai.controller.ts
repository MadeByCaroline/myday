import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';

interface AiRequest {
  user: {
    id: string;
  };
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('morning-briefing')
  async getMorningBriefing(@Req() req: AiRequest) {
    return this.aiService.generateMorningBriefing(req.user.id);
  }
}
