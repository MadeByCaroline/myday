import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleService } from '../integrations/google.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import { UsersService } from '../users/users.service';

interface DeepWorkAutomation {
  provider: string;
  email: string;
  eventId: string;
}

interface DeepWorkSession {
  startedAt: Date;
  endsAt: Date;
  durationMinutes: number;
  automations: DeepWorkAutomation[];
}

@Injectable()
export class FocusService {
  private readonly logger = new Logger(FocusService.name);
  private readonly sessionsByUser = new Map<string, DeepWorkSession>();

  constructor(
    private readonly usersService: UsersService,
    private readonly googleService: GoogleService,
    private readonly microsoftService: MicrosoftService,
  ) {}

  async startDeepWork(userId: string, durationMinutes: number) {
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new BadRequestException(
        'durationMinutes must be a positive number.',
      );
    }

    if (this.sessionsByUser.has(userId)) {
      await this.stopDeepWork(userId);
    }

    const startedAt = new Date();
    const endsAt = new Date(
      startedAt.getTime() + Math.round(durationMinutes) * 60 * 1000,
    );
    const oauthTokens = await this.usersService.getOAuthTokens(userId);
    const description =
      'I am currently in a deep work session until ' +
      this.formatSessionEnd(endsAt) +
      '. I will respond later.';

    const automationResults = await Promise.all(
      oauthTokens.map(async (oauthToken) => {
        const provider = oauthToken.provider.toUpperCase();

        if (provider === 'GOOGLE') {
          const eventId = await this.googleService.createBusyEvent(
            oauthToken.accessToken,
            oauthToken.refreshToken || undefined,
            startedAt,
            endsAt,
            description,
          );

          return eventId
            ? {
                provider,
                email: oauthToken.email,
                eventId,
              }
            : null;
        }

        if (provider === 'MICROSOFT') {
          const eventId = await this.microsoftService.createBusyEvent(
            oauthToken.accessToken,
            startedAt,
            endsAt,
            description,
          );

          return eventId
            ? {
                provider,
                email: oauthToken.email,
                eventId,
              }
            : null;
        }

        return null;
      }),
    );

    const automations = automationResults.filter(
      (result): result is DeepWorkAutomation => result !== null,
    );

    this.sessionsByUser.set(userId, {
      startedAt,
      endsAt,
      durationMinutes: Math.round(durationMinutes),
      automations,
    });

    return {
      active: true,
      startedAt,
      endsAt,
      durationMinutes: Math.round(durationMinutes),
      providers: automations.map((automation) => automation.provider),
    };
  }

  async stopDeepWork(userId: string) {
    const activeSession = this.sessionsByUser.get(userId);

    if (!activeSession) {
      return {
        active: false,
      };
    }

    const oauthTokens = await this.usersService.getOAuthTokens(userId);

    await Promise.allSettled(
      activeSession.automations.map(async (automation) => {
        const oauthToken = oauthTokens.find(
          (token) =>
            token.provider.toUpperCase() === automation.provider &&
            token.email === automation.email,
        );

        if (!oauthToken) {
          this.logger.warn(
            `No matching OAuth token found while stopping deep work for ${automation.provider}:${automation.email}`,
          );
          return;
        }

        if (automation.provider === 'GOOGLE') {
          await this.googleService.deleteBusyEvent(
            oauthToken.accessToken,
            oauthToken.refreshToken || undefined,
            automation.eventId,
          );
          return;
        }

        if (automation.provider === 'MICROSOFT') {
          await this.microsoftService.deleteBusyEvent(
            oauthToken.accessToken,
            automation.eventId,
          );
        }
      }),
    );

    this.sessionsByUser.delete(userId);

    return {
      active: false,
    };
  }

  getCurrentDeepWork(userId: string) {
    const activeSession = this.sessionsByUser.get(userId);

    if (!activeSession) {
      return {
        active: false,
      };
    }

    return {
      active: true,
      startedAt: activeSession.startedAt,
      endsAt: activeSession.endsAt,
      durationMinutes: activeSession.durationMinutes,
      providers: activeSession.automations.map(
        (automation) => automation.provider,
      ),
    };
  }

  private formatSessionEnd(sessionEnd: Date) {
    return sessionEnd.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
