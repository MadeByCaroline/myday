import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './google-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MicrosoftAuthGuard } from './microsoft-auth.guard';

interface AuthenticatedRequest {
  protocol: string;
  get(name: string): string | undefined;
  user: {
    id: string;
    email: string;
    name?: string;
    picture?: string;
    oauthTokens: Array<{ provider: string; email: string }>;
  };
}

interface GoogleCallbackRequest {
  user: {
    email: string;
    name: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    picture?: string;
    scope?: string;
    state?: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    return undefined;
  }

  @Get('google/link')
  @UseGuards(JwtAuthGuard)
  linkGoogleAuth(@Req() req: AuthenticatedRequest) {
    const state = this.authService.createGoogleLinkState(req.user.id);
    const host = req.get('host');
    const protocol = req.protocol;
    return {
      url: `${protocol}://${host}/auth/google?state=${encodeURIComponent(state)}`,
    };
  }

  @Get('microsoft')
  @UseGuards(MicrosoftAuthGuard)
  microsoftAuth() {
    return undefined;
  }

  @Get('microsoft/link')
  @UseGuards(JwtAuthGuard)
  linkMicrosoftAuth(@Req() req: AuthenticatedRequest) {
    const state = this.authService.createMicrosoftLinkState(req.user.id);
    const host = req.get('host');
    const protocol = req.protocol;
    return {
      url: `${protocol}://${host}/auth/microsoft?state=${encodeURIComponent(state)}`,
    };
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(
    @Req() req: GoogleCallbackRequest,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const linkedUserId = await this.authService.getUserIdFromGoogleLinkState(
      req.user.state,
    );

    try {
      if (linkedUserId) {
        await this.authService.validateGoogleUser(req.user, linkedUserId);
        res.redirect(`${frontendUrl}/dashboard?refreshProfile=1`);
        return;
      }

      const user = await this.authService.validateGoogleUser(req.user);
      const { access_token } = await this.authService.generateJwt(user);
      res.redirect(`${frontendUrl}/auth/callback?token=${access_token}`);
    } catch {
      if (linkedUserId) {
        res.redirect(`${frontendUrl}/dashboard?linkError=1`);
        return;
      }
      res.redirect(`${frontendUrl}/auth/callback?error=oauth_login_failed`);
    }
  }

  @Get('microsoft/callback')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftAuthCallback(
    @Req() req: GoogleCallbackRequest,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const linkedUserId = await this.authService.getUserIdFromMicrosoftLinkState(
      req.user.state,
    );

    if (!linkedUserId) {
      res.redirect(`${frontendUrl}/dashboard?linkError=1`);
      return;
    }

    try {
      await this.authService.validateMicrosoftUser(req.user, linkedUserId);
      res.redirect(`${frontendUrl}/dashboard?refreshProfile=1`);
    } catch {
      res.redirect(`${frontendUrl}/dashboard?linkError=1`);
    }
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: AuthenticatedRequest) {
    const { id, email, name, picture } = req.user;
    const connectedGoogleAccounts = req.user.oauthTokens
      .filter((token) => token.provider.toUpperCase() === 'GOOGLE')
      .map((token) => token.email);
    const connectedOutlookAccounts = req.user.oauthTokens
      .filter((token) => token.provider.toUpperCase() === 'MICROSOFT')
      .map((token) => token.email);

    return {
      id,
      email,
      name,
      picture,
      connectedGoogleAccounts,
      connectedOutlookAccounts,
    };
  }
}
