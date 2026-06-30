import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SocialProvider } from '@prisma/client';
import axios from 'axios';

interface SocialLinkState {
  action: 'link-social-account';
  provider: SocialProvider;
  sub: string;
}

@Injectable()
export class SocialOAuthService {
  private static readonly PROVIDER_SCOPES: Record<SocialProvider, readonly string[]> = {
    INSTAGRAM: [
      'instagram_manage_insights',
      'pages_read_engagement',
      'business_management',
    ],
    FACEBOOK: ['pages_read_engagement', 'pages_show_list', 'read_insights'],
    TIKTOK: ['user.info.basic', 'business.data.insights.read'],
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  createLinkState(userId: string, provider: SocialProvider) {
    return this.jwtService.sign(
      { action: 'link-social-account', provider, sub: userId },
      { expiresIn: '10m' },
    );
  }

  async readLinkState(state: string | undefined, provider: SocialProvider) {
    if (!state) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<SocialLinkState>(state);
      if (
        payload.action !== 'link-social-account' ||
        payload.provider !== provider ||
        !payload.sub
      ) {
        return null;
      }
      return payload.sub;
    } catch {
      return null;
    }
  }

  getAuthorizationUrl(
    provider: SocialProvider,
    userId: string,
    apiOrigin: string,
  ) {
    const state = this.createLinkState(userId, provider);
    const redirectUri = `${apiOrigin}/social/oauth/${provider.toLowerCase()}/callback`;
    const scopes = this.getScopes(provider).join(',');

    if (provider === 'TIKTOK') {
      const clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY') || '';
      const params = new URLSearchParams({
        client_key: clientKey,
        response_type: 'code',
        scope: scopes,
        state,
        redirect_uri: redirectUri,
      });
      return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }

    const clientId = this.configService.get<string>('META_APP_ID') || '';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      response_type: 'code',
      state,
    });

    return `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`;
  }

  async exchangeAuthorizationCode(
    provider: SocialProvider,
    code: string,
    redirectUri: string,
  ) {
    if (provider === 'TIKTOK') {
      const clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY') || '';
      const clientSecret =
        this.configService.get<string>('TIKTOK_CLIENT_SECRET') || '';
      const { data } = await axios.post(
        'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
        {
          app_id: clientKey,
          secret: clientSecret,
          auth_code: code,
          grant_type: 'auth_code',
        },
      );

      const tokenData = data?.data || {};
      return {
        accessToken: tokenData.access_token as string,
        refreshToken: tokenData.refresh_token as string | undefined,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + Number(tokenData.expires_in) * 1000)
          : null,
      };
    }

    const clientId = this.configService.get<string>('META_APP_ID') || '';
    const clientSecret = this.configService.get<string>('META_APP_SECRET') || '';

    const { data } = await axios.get('https://graph.facebook.com/v22.0/oauth/access_token', {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
    });

    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresAt: data.expires_in
        ? new Date(Date.now() + Number(data.expires_in) * 1000)
        : null,
    };
  }

  async resolveExternalAccountId(provider: SocialProvider, accessToken: string) {
    if (provider === 'TIKTOK') {
      const { data } = await axios.get(
        'https://business-api.tiktok.com/open_api/v1.3/user/info/',
        {
          headers: { 'Access-Token': accessToken },
        },
      );
      return String(
        data?.data?.user_id ??
          data?.data?.advertiser_id ??
          data?.data?.open_id ??
          '',
      );
    }

    const { data } = await axios.get('https://graph.facebook.com/v22.0/me', {
      params: {
        fields: provider === 'INSTAGRAM' ? 'id,username' : 'id,name',
        access_token: accessToken,
      },
    });

    return String(data?.id || '');
  }

  getScopes(provider: SocialProvider) {
    return [...SocialOAuthService.PROVIDER_SCOPES[provider]];
  }

  validateReadOnlyScopes(provider: SocialProvider, scopeInput: string) {
    const allowed = new Set(this.getScopes(provider));
    const scopes = scopeInput
      .split(/[\s,]+/u)
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);

    if (scopes.length === 0) {
      throw new BadRequestException('No scopes were provided by OAuth provider.');
    }

    const invalid = scopes.find((scope) => !allowed.has(scope));
    if (invalid) {
      throw new BadRequestException(`Scope ${invalid} is not allowed for ${provider}.`);
    }

    const required = this.getScopes(provider);
    const missing = required.filter((scope) => !scopes.includes(scope));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required scopes for ${provider}: ${missing.join(', ')}`,
      );
    }

    return scopes.join(' ');
  }
}
