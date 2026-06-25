import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateGoogleUser(googleUser: {
    email: string;
    name: string;
    picture?: string;
    accessToken: string;
    refreshToken?: string;
  }) {
    return this.usersService.findOrCreate({
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      provider: 'google',
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
}
