import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';

const MAX_NOTES_LENGTH = 5000;

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

  @Post('generate-content')
  async generateContent(@Body() body: { notes?: string }) {
    const notes = body?.notes ?? '';
    if (typeof notes !== 'string' || notes.trim().length === 0) {
      throw new BadRequestException('Le champ "notes" est requis.');
    }
    if (notes.length > MAX_NOTES_LENGTH) {
      throw new BadRequestException(
        `Les notes ne doivent pas dépasser ${MAX_NOTES_LENGTH} caractères.`,
      );
    }
    return this.aiService.processMeetingNotes(notes.trim());
  }
}
