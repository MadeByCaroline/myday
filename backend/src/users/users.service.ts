import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOrCreate(data: {
    email: string;
    name?: string;
    picture?: string;
    provider: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scope?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
      include: { oauthTokens: true },
    });

    if (!user) {
      return this.prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          picture: data.picture,
          oauthTokens: {
            create: {
              provider: data.provider,
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
              expiresAt: data.expiresAt,
              scope: data.scope,
            },
          },
        },
        include: { oauthTokens: true },
      });
    }

    await this.prisma.oAuthToken.upsert({
      where: { userId_provider: { userId: user.id, provider: data.provider } },
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        scope: data.scope,
      },
      create: {
        userId: user.id,
        provider: data.provider,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        scope: data.scope,
      },
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { oauthTokens: true },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { oauthTokens: true },
    });
  }

  async getOAuthToken(userId: string, provider: string) {
    return this.prisma.oAuthToken.findUnique({
      where: { userId_provider: { userId, provider } },
    });
  }
}
