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
      scope: [
        'openid',
        'profile',
        'email',
        'user.read',
        'mail.read',
        'offline_access',
      ],
      passReqToCallback: true,
    };

    super(options);
  }

  // NestJS Passport strategies return the user payload from validate().
  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(
    arg1: any,
    arg2: any,
    arg3: any,
    arg4: any,
    arg5?: any,
  ): Promise<OAuthCallbackUser> {
    // Passport strategies can shift arguments. The profile is usually an object with an 'id' or '_json'.
    // We find the profile object dynamically among the arguments.
    const args = [arg1, arg2, arg3, arg4, arg5];
    const profile = args.find(
      (arg) =>
        arg &&
        typeof arg === 'object' &&
        (arg.id || arg._json || arg.emails || arg.displayName),
    ) as MicrosoftProfile | undefined;

    // The tokens are usually strings.
    const strings = args.filter((arg) => typeof arg === 'string');
    const accessToken = strings[0] || '';
    const refreshToken = strings[1] || '';

    if (!profile) {
      console.error(
        'Microsoft Args received (types):',
        args.map((a) => (a === null ? 'null' : typeof a)),
      );
      throw new Error('Microsoft profile object not found in arguments.');
    }

    // Extract email robustly from wherever Microsoft hid it
    const email =
      profile.emails?.[0]?.value ||
      profile._json?.mail ||
      profile._json?.userPrincipalName ||
      profile.userPrincipalName;

    if (!email) {
      console.error('Microsoft Profile received (provider):', profile.provider);
      throw new Error('Microsoft account email was not provided.');
    }

    // Extract state from the request object when passReqToCallback is true
    const req =
      arg1 && typeof arg1 === 'object' && 'query' in arg1
        ? (arg1 as Request)
        : null;
    const state =
      typeof req?.query?.state === 'string' ? req.query.state : undefined;

    // Extract token params for expiresAt and scope
    const params = args.find(
      (arg) =>
        arg &&
        typeof arg === 'object' &&
        'expires_in' in arg &&
        !('query' in arg),
    ) as MicrosoftTokenParams | undefined;
    const expiresInSeconds = Number(params?.expires_in);

    return {
      email,
      name: profile.displayName || email,
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresInSeconds)
        ? new Date(Date.now() + expiresInSeconds * 1000)
        : undefined,
      scope: params?.scope,
      state,
    };
  }
}
