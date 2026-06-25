import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-microsoft';

interface MicrosoftProfile {
  displayName: string;
  emails?: Array<{ type: string; value: string }>;
  userPrincipalName?: string;
}

type VerifyCallback = (error: Error | null, user?: unknown, info?: unknown) => void;

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('MICROSOFT_CALLBACK_URL'),
      scope: ['user.read', 'mail.read', 'offline_access'],
      passReqToCallback: true,
      addUPNAsEmail: true,
    } as any);
  }

  validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: MicrosoftProfile,
    done: VerifyCallback,
  ): void {
    const email =
      profile.emails?.[0]?.value ?? profile.userPrincipalName ?? '';
    if (!email) {
      done(
        new Error(
          'Microsoft account email was not provided. Please ensure your Microsoft account has a verified email address and try again.',
        ),
      );
      return;
    }

    const state =
      typeof req.query.state === 'string' ? req.query.state : undefined;
    done(null, {
      email,
      name: profile.displayName,
      accessToken,
      refreshToken,
      state,
    });
  }
}
