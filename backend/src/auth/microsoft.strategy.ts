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
  userPrincipalName?: string;
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

  // NestJS Passport strategies return the user payload from validate().
  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    params: MicrosoftTokenParams,
    profile: MicrosoftProfile,
  ): Promise<OAuthCallbackUser> {
    console.log('Microsoft Profile:', profile._json);

    const email =
      profile.emails?.[0]?.value ||
      profile._json?.mail ||
      profile._json?.userPrincipalName ||
      profile.userPrincipalName;

    if (!email) {
      throw new Error('Microsoft account email was not provided.');
    }

    const state =
      typeof req.query.state === 'string' ? req.query.state : undefined;
    const expiresInSeconds = Number(params.expires_in);
    return {
      email,
      name: profile.displayName || email,
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresInSeconds)
        ? new Date(Date.now() + expiresInSeconds * 1000)
        : undefined,
      scope: params.scope,
      state,
    };
  }
}
