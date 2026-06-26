import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import type { Profile as PassportProfile } from 'passport';
import {
  Strategy,
  type MicrosoftStrategyOptionsWithRequest,
} from 'passport-microsoft';

interface MicrosoftProfile extends PassportProfile {
  _json?: {
    mail?: string;
    userPrincipalName?: string;
  };
}

interface MicrosoftTokenParams {
  expires_in?: string;
  scope?: string;
}

interface OAuthCallbackUser {
  email: string;
  name: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  state?: string;
}

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(private configService: ConfigService) {
    const options: MicrosoftStrategyOptionsWithRequest = {
      clientID: configService.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('MICROSOFT_CALLBACK_URL'),
      tenant: 'common',
      scope: ['user.read', 'mail.read', 'offline_access'],
      passReqToCallback: true,
    };

    super(options);
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    params: MicrosoftTokenParams,
    profile: MicrosoftProfile,
  ): Promise<OAuthCallbackUser> {
    const email =
      profile.emails?.[0]?.value ??
      profile._json?.mail ??
      profile._json?.userPrincipalName ??
      '';

    if (!email) {
      throw new Error(
        'Microsoft account email was not provided. Please ensure your Microsoft account has a valid email address and try again.',
      );
    }

    const state =
      typeof req.query.state === 'string' ? req.query.state : undefined;
    const expiresInSeconds = Number(params.expires_in);
    return await Promise.resolve({
      email,
      name: profile.displayName || email,
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresInSeconds)
        ? new Date(Date.now() + expiresInSeconds * 1000)
        : undefined,
      scope: params.scope,
      state,
    });
  }
}
