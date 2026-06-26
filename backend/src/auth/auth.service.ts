import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateGoogleUser(
    googleUser: {
      email: string;
      name: string;
      picture?: string;
      accessToken: string;
      refreshToken?: string;
    },
    userIdToLink?: string,
  ) {
    if (userIdToLink) {
      await this.usersService.linkOAuthToken(userIdToLink, {
        provider: 'google',
        email: googleUser.email,
        accessToken: googleUser.accessToken,
        refreshToken: googleUser.refreshToken,
      });
      const linkedUser = await this.usersService.findById(userIdToLink);
      if (!linkedUser) {
        throw new Error('User not found after Google account link');
      }
      return linkedUser;
    }

    return this.usersService.findOrCreate({
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      provider: 'google',
      oauthEmail: googleUser.email,
      accessToken: googleUser.accessToken,
      refreshToken: googleUser.refreshToken,
    });
  }

  async validateMicrosoftUser(
    microsoftUser: {
      email: string;
      name: string;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      scope?: string;
    },
    userIdToLink: string,
  ) {
    await this.usersService.linkOAuthToken(userIdToLink, {
      provider: 'MICROSOFT',
      email: microsoftUser.email,
      accessToken: microsoftUser.accessToken,
      refreshToken: microsoftUser.refreshToken,
      expiresAt: microsoftUser.expiresAt,
      scope: microsoftUser.scope,
    });
    const linkedUser = await this.usersService.findById(userIdToLink);
    if (!linkedUser) {
      throw new Error('User not found after Microsoft account link');
    }
    return linkedUser;
  }

  async generateJwt(user: { id: string; email: string }) {
    const payload = { sub: user.id, email: user.email };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  createOAuthLinkState(userId: string, provider: 'google' | 'MICROSOFT') {
    return this.jwtService.sign(
      { action: 'link-oauth-account', provider, sub: userId },
      { expiresIn: '10m' },
    );
  }

  createGoogleLinkState(userId: string) {
    return this.createOAuthLinkState(userId, 'google');
  }

  createMicrosoftLinkState(userId: string) {
    return this.createOAuthLinkState(userId, 'MICROSOFT');
  }

  async getUserIdFromOAuthLinkState(
    state: string | undefined,
    provider: 'google' | 'MICROSOFT',
  ) {
    if (!state) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        action?: string;
        provider?: string;
        sub?: string;
      }>(state);
      if (
        payload.action !== 'link-oauth-account' ||
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

  async getUserIdFromGoogleLinkState(state?: string) {
    return this.getUserIdFromOAuthLinkState(state, 'google');
  }

  async getUserIdFromMicrosoftLinkState(state?: string) {
    return this.getUserIdFromOAuthLinkState(state, 'MICROSOFT');
  }

  async getConnections(userId: string) {
    const oauthTokens = await this.usersService.getOAuthTokens(userId);

    return oauthTokens.map((token) => ({
      provider: token.provider.toUpperCase(),
      email: token.email,
    }));
  }

  async disconnectConnection(userId: string, provider: string) {
    const normalizedProvider = provider.trim().toUpperCase();

    return this.usersService.deleteOAuthTokens(
      userId,
      this.getProviderVariants(normalizedProvider),
    );
  }

  private getProviderVariants(provider: string) {
    return [...new Set([provider.toLowerCase(), provider.toUpperCase()])];
  }
}
