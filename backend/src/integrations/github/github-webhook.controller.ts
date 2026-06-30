import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import {
  GithubWebhookService,
  type GithubIssuePayload,
} from './github-webhook.service';

@Controller('integrations/github')
export class GithubWebhookController {
  constructor(private readonly githubWebhookService: GithubWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Body() payload: GithubIssuePayload,
  ): Promise<{ processed: boolean }> {
    if (!req.rawBody) {
      throw new BadRequestException('Missing request body');
    }

    if (event !== 'issues') {
      return { processed: false };
    }

    return this.githubWebhookService.handleIssueEvent(
      req.rawBody,
      signature,
      payload,
    );
  }
}
