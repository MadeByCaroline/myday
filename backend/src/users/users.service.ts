import { ConflictException, Injectable } from '@nestjs/common';
import type { EmailProvider } from '@prisma/client';
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
      const createdUser = await this.prisma.user.create({
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

      await this.upsertEmailAccountForOAuth(createdUser.id, {
        provider: data.provider,
        email: data.oauthEmail,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      });

      return createdUser;
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

    const token = await this.prisma.oAuthToken.upsert({
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

    await this.upsertEmailAccountForOAuth(userId, {
      provider: data.provider,
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
    });

    return token;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { oauthTokens: true, emailAccounts: true },
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

  async getEmailAccounts(userId: string) {
    return this.prisma.emailAccount.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createImapEmailAccount(
    userId: string,
    data: {
      emailAddress: string;
      label: string;
      host: string;
      port: number;
      secure: boolean;
      password: string;
    },
  ) {
    return this.prisma.emailAccount.create({
      data: {
        userId,
        provider: 'IMAP',
        emailAddress: data.emailAddress,
        label: data.label,
        imapConfig: {
          host: data.host,
          port: data.port,
          secure: data.secure,
          password: data.password,
          user: data.emailAddress,
        },
      },
    });
  }

  async disconnectEmailAccount(userId: string, accountId: string) {
    const account = await this.prisma.emailAccount.findFirstOrThrow({
      where: { id: accountId, userId },
    });

    await this.prisma.emailAccount.delete({
      where: { id: account.id },
    });

    if (account.provider !== 'IMAP') {
      await this.prisma.oAuthToken.deleteMany({
        where: {
          userId,
          email: account.emailAddress,
          provider: { in: this.getOAuthProviderVariants(account.provider) },
        },
      });
    }

    return account;
  }

  private async upsertEmailAccountForOAuth(
    userId: string,
    data: {
      provider: string;
      email: string;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
    },
  ) {
    const provider = this.toEmailProvider(data.provider);
    if (!provider) {
      return;
    }

    const existing = await this.prisma.emailAccount.findFirst({
      where: {
        userId,
        provider,
        emailAddress: data.email,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return this.prisma.emailAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        },
      });
    }

    return this.prisma.emailAccount.create({
      data: {
        userId,
        provider,
        emailAddress: data.email,
        label: data.email,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      },
    });
  }

  private toEmailProvider(provider: string): EmailProvider | null {
    const normalizedProvider = provider.trim().toUpperCase();
    if (normalizedProvider === 'GOOGLE') {
      return 'GOOGLE';
    }
    if (normalizedProvider === 'MICROSOFT') {
      return 'MICROSOFT';
    }
    return null;
  }

  private getOAuthProviderVariants(provider: EmailProvider) {
    return provider === 'GOOGLE' ? ['google', 'GOOGLE'] : ['MICROSOFT', 'microsoft'];
  }
}
