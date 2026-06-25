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

  createGoogleLinkState(userId: string) {
    return this.jwtService.sign(
      { action: 'link-google-account', sub: userId },
      { expiresIn: '10m' },
    );
  }

  async getUserIdFromGoogleLinkState(state?: string) {
    if (!state) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        action?: string;
        sub?: string;
      }>(state);
      if (payload.action !== 'link-google-account' || !payload.sub) {
        return null;
      }
      return payload.sub;
    } catch {
      return null;
    }
  }
}
