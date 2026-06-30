import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { NotionOAuthService } from './notion-oauth.service';
import { NotionSyncService } from './notion-sync.service';

interface AuthenticatedRequest {
  protocol: string;
  get(name: string): string | undefined;
  user: { id: string };
}

@Controller('integrations/notion')
export class NotionController {
  constructor(
    private readonly notionOAuth: NotionOAuthService,
    private readonly notionSync: NotionSyncService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Get('oauth/link')
  @UseGuards(JwtAuthGuard)
  getAuthorizationLink(@Req() req: AuthenticatedRequest) {
    const host = req.get('host');
    const redirectUri = `${req.protocol}://${host}/integrations/notion/oauth/callback`;
    const url = this.notionOAuth.getAuthorizationUrl(req.user.id, redirectUri);
    return { url };
  }

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: { protocol: string; get(name: string): string | undefined },
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    if (error || !code) {
      res.redirect(`${frontendUrl}/app/integrations?notionError=1`);
      return;
    }

    const decoded = this.notionOAuth.decodeState(state);
    if (!decoded?.userId) {
      res.redirect(`${frontendUrl}/app/integrations?notionError=1`);
      return;
    }

    const host = req.get('host');
    const redirectUri = `${req.protocol}://${host}/integrations/notion/oauth/callback`;

    try {
      const token = await this.notionOAuth.exchangeCode(code, redirectUri);

      await this.prisma.oAuthToken.upsert({
        where: {
          userId_provider_email: {
            userId: decoded.userId,
            provider: 'NOTION',
            email: token.workspace_id,
          },
        },
        update: {
          accessToken: token.access_token,
          refreshToken: null,
        },
        create: {
          userId: decoded.userId,
          provider: 'NOTION',
          email: token.workspace_id,
          accessToken: token.access_token,
        },
      });

      res.redirect(`${frontendUrl}/app/integrations?notionConnected=1`);
    } catch {
      res.redirect(`${frontendUrl}/app/integrations?notionError=1`);
    }
  }

  @Get('databases')
  @UseGuards(JwtAuthGuard)
  async listDatabases(@Req() req: AuthenticatedRequest) {
    const token = await this.prisma.oAuthToken.findFirst({
      where: { userId: req.user.id, provider: 'NOTION' },
    });

    if (!token) {
      return { connected: false, databases: [] };
    }

    try {
      const databases = await this.notionOAuth.listDatabases(token.accessToken);
      return {
        connected: true,
        databases: databases.map((db) => ({
          id: db.id,
          name: db.title?.[0]?.plain_text ?? 'Untitled',
        })),
      };
    } catch {
      return { connected: true, databases: [] };
    }
  }
}
