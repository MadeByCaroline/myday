import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailsService } from './emails.service';

interface EmailDraftRequest {
  user: {
    id: string;
  };
}

interface DraftActionBody {
  action?: string;
}

@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post('draft/:messageId')
  async createDraft(
    @Req() req: EmailDraftRequest,
    @Param('messageId') messageId: string,
    @Body() body: DraftActionBody | string,
  ) {
    const action =
      typeof body === 'string'
        ? body
        : typeof body.action === 'string'
          ? body.action
          : '';

    return this.emailsService.createDraft(req.user.id, messageId, action);
  }
}
