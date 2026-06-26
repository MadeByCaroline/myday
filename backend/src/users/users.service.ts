import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOrCreate(data: {
    email: string;
    name?: string;
    picture?: string;
    provider: string;
    oauthEmail: string;
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
              email: data.oauthEmail,
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

    await this.linkOAuthToken(user.id, {
      provider: data.provider,
      email: data.oauthEmail,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scope: data.scope,
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { oauthTokens: true },
    });
  }

  async linkOAuthToken(
    userId: string,
    data: {
      provider: string;
      email: string;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      scope?: string;
    },
  ) {
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true },
    });

    const existingToken = await this.prisma.oAuthToken.findUnique({
      where: {
        provider_email: {
          provider: data.provider,
          email: data.email,
        },
      },
      select: { userId: true },
    });

    if (existingToken && existingToken.userId !== userId) {
      throw new ConflictException(
        'This Google account is already linked to another user.',
      );
    }

    return this.prisma.oAuthToken.upsert({
      where: {
        userId_provider_email: {
          userId,
          provider: data.provider,
          email: data.email,
        },
      },
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        scope: data.scope,
      },
      create: {
        userId,
        provider: data.provider,
        email: data.email,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        scope: data.scope,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { oauthTokens: true },
    });
  }

  async getOAuthToken(userId: string, provider: string) {
    return this.prisma.oAuthToken.findFirst({
      where: { userId, provider },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getOAuthTokens(userId: string, provider?: string) {
    return this.prisma.oAuthToken.findMany({
      where: provider ? { userId, provider } : { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async deleteOAuthTokens(userId: string, providers: string[]) {
    return this.prisma.oAuthToken.deleteMany({
      where: {
        userId,
        provider: { in: providers },
      },
    });
  }
}
