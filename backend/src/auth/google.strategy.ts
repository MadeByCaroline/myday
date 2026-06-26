import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      accessType: 'offline',
      prompt: 'consent',
      passReqToCallback: true,
    } as any);
  }

  validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value ?? '';
    if (!email) {
      done(
        new Error(
          'Google account email was not provided. Please ensure your Google account has a verified email address and try again.',
        ),
        false,
      );
      return;
    }

    const picture = profile.photos?.[0]?.value;
    const state =
      typeof req.query.state === 'string' ? req.query.state : undefined;
    done(null, {
      email,
      name: profile.displayName,
      picture,
      accessToken,
      refreshToken,
      state,
    });
  }
}
