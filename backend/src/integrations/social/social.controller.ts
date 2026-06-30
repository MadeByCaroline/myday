import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SocialProvider } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SocialOAuthService } from './social-oauth.service';
import { SocialSyncService } from './social-sync.service';

interface AuthenticatedRequest {
  protocol: string;
  get(name: string): string | undefined;
  user: { id: string };
}

interface LinkSocialBody {
  provider: SocialProvider;
  externalAccountId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry?: string;
  scopes: string;
}

function parseProvider(provider: string): SocialProvider {
  const normalized = provider.trim().toUpperCase();
  if (normalized === 'INSTAGRAM' || normalized === 'FACEBOOK' || normalized === 'TIKTOK') {
    return normalized;
  }
  throw new BadRequestException(`Unsupported provider: ${provider}`);
}

async function saveLinkedAccount(
  prisma: PrismaService,
  socialSyncService: SocialSyncService,
  userId: string,
  body: LinkSocialBody,
  scope: string,
) {
  const tokenExpiry = body.tokenExpiry ? new Date(body.tokenExpiry) : null;
  const account = await prisma.socialAccount.upsert({
    where: {
      userId_provider_externalAccountId: {
        userId,
        provider: body.provider,
        externalAccountId: body.externalAccountId,
      },
    },
    update: {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken || null,
      tokenExpiry,
    },
    create: {
      userId,
      provider: body.provider,
      externalAccountId: body.externalAccountId,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken || null,
      tokenExpiry,
    },
  });

  await prisma.oAuthToken.upsert({
    where: {
      userId_provider_email: {
        userId,
        provider: body.provider,
        email: body.externalAccountId,
      },
    },
    update: {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: tokenExpiry,
      scope,
    },
    create: {
      userId,
      provider: body.provider,
      email: body.externalAccountId,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: tokenExpiry,
      scope,
    },
  });

  await socialSyncService.enqueueSync(account.id, true);
  return account;
}

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthService: SocialOAuthService,
    private readonly socialSyncService: SocialSyncService,
  ) {}

  @Get('oauth/:provider/link')
  getProviderLink(
    @Req() req: AuthenticatedRequest,
    @Param('provider') providerParam: string,
  ) {
    const provider = parseProvider(providerParam);
    const host = req.get('host');
    const protocol = req.protocol;
    const apiOrigin = `${protocol}://${host}`;

    return {
      provider,
      scopes: this.oauthService.getScopes(provider),
      url: this.oauthService.getAuthorizationUrl(provider, req.user.id, apiOrigin),
    };
  }

  @Post('accounts/link')
  async linkAccount(
    @Req() req: AuthenticatedRequest,
    @Body() body: LinkSocialBody,
  ) {
    const provider = parseProvider(body.provider);
    const externalAccountId = body.externalAccountId?.trim();

    if (!externalAccountId || !body.accessToken || !body.scopes) {
      throw new BadRequestException('Missing social account fields.');
    }

    const scope = this.oauthService.validateReadOnlyScopes(provider, body.scopes);

    const account = await saveLinkedAccount(
      this.prisma,
      this.socialSyncService,
      req.user.id,
      {
        provider,
        externalAccountId,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        tokenExpiry: body.tokenExpiry,
        scopes: body.scopes,
      },
      scope,
    );

    return {
      id: account.id,
      provider: account.provider,
      externalAccountId: account.externalAccountId,
    };
  }

  @Get('accounts')
  async listAccounts(@Req() req: AuthenticatedRequest) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    });

    return accounts.map((account) => {
      const now = Date.now();
      const expiry = account.tokenExpiry?.getTime() ?? null;
      const expiresInDays =
        expiry === null ? null : Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      const status =
        expiry !== null && expiry <= now
          ? 'EXPIRED'
          : expiresInDays !== null && expiresInDays <= 7
            ? 'EXPIRING_SOON'
            : 'ACTIVE';

      return {
        id: account.id,
        provider: account.provider,
        externalAccountId: account.externalAccountId,
        tokenExpiry: account.tokenExpiry,
        expiresInDays,
        status,
      };
    });
  }

  @Post('accounts/:id/sync')
  async triggerSync(
    @Req() req: AuthenticatedRequest,
    @Param('id') accountId: string,
  ) {
    const account = await this.prisma.socialAccount.findFirstOrThrow({
      where: {
        id: accountId,
        userId: req.user.id,
      },
    });

    await this.socialSyncService.enqueueSync(account.id, true);

    return { queued: true };
  }

  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest) {
    return this.socialSyncService.getStatsForUser(req.user.id);
  }

  @Get('notifications/token-expiry')
  async getTokenExpiryNotifications(@Req() req: AuthenticatedRequest) {
    return this.socialSyncService.getAccountNotifications(req.user.id);
  }
}

@Controller('social/oauth')
export class SocialOAuthCallbackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthService: SocialOAuthService,
    private readonly socialSyncService: SocialSyncService,
    private readonly configService: ConfigService,
  ) {}

  @Get(':provider/callback')
  async oauthCallback(
    @Param('provider') providerParam: string,
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('scope') scopeParam: string | undefined,
    @Query('error') errorParam: string | undefined,
    @Req() req: { protocol: string; get(name: string): string | undefined },
    @Res() res: Response,
  ) {
    const provider = parseProvider(providerParam);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    if (errorParam || !code) {
      res.redirect(`${frontendUrl}/app/integrations?linkError=1`);
      return;
    }

    const userId = await this.oauthService.readLinkState(state, provider);
    if (!userId) {
      res.redirect(`${frontendUrl}/app/integrations?linkError=1`);
      return;
    }

    try {
      const host = req.get('host');
      const redirectUri = `${req.protocol}://${host}/social/oauth/${provider.toLowerCase()}/callback`;
      const exchanged = await this.oauthService.exchangeAuthorizationCode(
        provider,
        code,
        redirectUri,
      );
      const externalAccountId = await this.oauthService.resolveExternalAccountId(
        provider,
        exchanged.accessToken,
      );
      const scope = this.oauthService.validateReadOnlyScopes(
        provider,
        scopeParam || this.oauthService.getScopes(provider).join(','),
      );

      await saveLinkedAccount(
        this.prisma,
        this.socialSyncService,
        userId,
        {
          provider,
          externalAccountId,
          accessToken: exchanged.accessToken,
          refreshToken: exchanged.refreshToken,
          tokenExpiry: exchanged.expiresAt?.toISOString(),
          scopes: scope,
        },
        scope,
      );

      res.redirect(`${frontendUrl}/app/integrations?refreshProfile=1`);
    } catch {
      res.redirect(`${frontendUrl}/app/integrations?linkError=1`);
    }
  }
}
