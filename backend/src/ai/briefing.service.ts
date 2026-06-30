import { Injectable, Logger, Optional } from '@nestjs/common';
import type { CalendarService } from '../calendar/calendar.service';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import type { EmailSummary } from '../integrations/gmail.client';
import type { MicrosoftService } from '../integrations/microsoft.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TasksService } from '../tasks/tasks.service';
import {
  type MorningBriefingContext,
  type MorningBriefingResult,
} from './ai.types';

const HIGH_PRIORITY_KEYWORDS = [
  'high',
  'priority',
  'urgent',
  'asap',
  'important',
  'p1',
];

type CalendarEvent = import('../calendar/calendar.service').CalendarEvent;

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);
  private readonly cache = new Map<
    string,
    { dateKey: string; briefing: MorningBriefingResult }
  >();

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly mailService?: MailService,
    @Optional() private readonly calendarService?: CalendarService,
    @Optional() private readonly tasksService?: TasksService,
    @Optional() private readonly microsoftService?: MicrosoftService,
  ) {}

  async getMorningBriefingContext(
    userId: string,
  ): Promise<MorningBriefingContext> {
    const prisma = this.requireDependency(this.prisma, 'PrismaService');
    const mailService = this.requireDependency(this.mailService, 'MailService');
    const calendarService = this.requireDependency(
      this.calendarService,
      'CalendarService',
    );
    const tasksService = this.requireDependency(
      this.tasksService,
      'TasksService',
    );
    const microsoftService = this.requireDependency(
      this.microsoftService,
      'MicrosoftService',
    );

    const oauthTokens = await prisma.oAuthToken.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    const [taskRows, providerData] = await Promise.all([
      tasksService.getUserTasks(userId),
      Promise.all(
        oauthTokens.map(async (oauthToken) => {
          const provider = oauthToken.provider.toUpperCase();

          if (provider === 'GOOGLE') {
            const [emails, events] = await Promise.all([
              mailService.getUnreadEmailsSince(
                oauthToken.accessToken,
                oauthToken.refreshToken || undefined,
                12,
              ),
              calendarService.getTodayEvents(
                oauthToken.accessToken,
                oauthToken.refreshToken || undefined,
              ),
            ]);

            return { emails, events };
          }

          if (provider === 'MICROSOFT') {
            const [emails, events] = await Promise.all([
              microsoftService.getUnreadEmails(
                oauthToken.accessToken,
                oauthToken.refreshToken || undefined,
              ),
              microsoftService.getTodayEvents(
                oauthToken.accessToken,
                oauthToken.refreshToken || undefined,
              ),
            ]);

            return {
              emails: this.filterEmailsFromLastHours(emails, 12),
              events: events.map((event) => this.mapUnifiedEvent(event)),
            };
          }

          return { emails: [], events: [] };
        }),
      ),
    ]);

    const todoTasks = taskRows.filter((task) => task.status === 'TODO');
    const highPriorityTodoTasks = this.selectHighPriorityTasks(todoTasks);

    return {
      unreadEmails: providerData.flatMap((entry) => entry.emails),
      todayEvents: providerData.flatMap((entry) => entry.events),
      highPriorityTodoTasks,
    };
  }

  normalizeMorningBriefing(value: unknown): MorningBriefingResult {
    if (typeof value !== 'object' || value === null) {
      return this.buildFallbackMorningBriefing({
        unreadEmails: [],
        todayEvents: [],
        highPriorityTodoTasks: [],
      });
    }

    const data = value as Record<string, unknown>;
    return {
      greeting: this.safeString(
        data.greeting,
        'Bonjour ! Voici votre plan pour la journée.',
      ),
      emailSummary: this.safeString(
        data.emailSummary,
        'Aucun e-mail non lu au cours des 12 dernières heures.',
      ),
      scheduleOverview: this.safeString(
        data.scheduleOverview,
        "Vous n'avez pas d'événements au calendrier aujourd'hui.",
      ),
      recommendedFocus: this.safeString(
        data.recommendedFocus,
        'Commencez par votre tâche TODO prioritaire pour prendre de l\u2019élan.',
      ),
    };
  }

  buildFallbackMorningBriefing(
    context: MorningBriefingContext,
  ): MorningBriefingResult {
    const topTask =
      context.highPriorityTodoTasks[0]?.title || 'votre tâche TODO prioritaire';

    return {
      greeting: 'Bonjour ! Tout est prêt pour bien démarrer.',
      emailSummary:
        context.unreadEmails.length > 0
          ? `Vous avez ${context.unreadEmails.length} e-mail(s) non lu(s) au cours des 12 dernières heures.`
          : 'Aucun e-mail non lu au cours des 12 dernières heures.',
      scheduleOverview:
        context.todayEvents.length > 0
          ? `Vous avez ${context.todayEvents.length} événement(s) à votre calendrier aujourd'hui.`
          : "Votre calendrier est dégagé aujourd'hui, vous pouvez donc créer des plages de concentration.",
      recommendedFocus: `Donnez la priorité à ${topTask} d'abord, puis traitez vos suivis e-mail par lot.`,
    };
  }

  parseBriefingResponse(response: string): unknown {
    try {
      return JSON.parse(response) as unknown;
    } catch {
      throw new Error('AI returned invalid morning briefing JSON.');
    }
  }

  pruneCache(todayKey: string): void {
    for (const [userId, cacheValue] of this.cache.entries()) {
      if (cacheValue.dateKey !== todayKey) {
        this.cache.delete(userId);
      }
    }
  }

  getFromCache(
    userId: string,
  ): { dateKey: string; briefing: MorningBriefingResult } | undefined {
    return this.cache.get(userId);
  }

  setInCache(
    userId: string,
    entry: { dateKey: string; briefing: MorningBriefingResult },
  ): void {
    this.cache.set(userId, entry);
  }

  private filterEmailsFromLastHours(
    emails: EmailSummary[],
    hours: number,
  ): EmailSummary[] {
    const threshold = Date.now() - hours * 60 * 60 * 1000;
    return emails.filter((email) => {
      const receivedAt = Date.parse(email.receivedAt);
      if (!Number.isFinite(receivedAt)) {
        this.logger.warn(
          `Skipping email with invalid receivedAt value: ${email.receivedAt || '[empty]'}`,
        );
        return false;
      }
      return receivedAt >= threshold;
    });
  }

  private mapUnifiedEvent(event: UnifiedEvent): CalendarEvent {
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location,
    };
  }

  private selectHighPriorityTasks(
    tasks: Array<{ id: string; title: string; description: string | null }>,
  ): Array<{ id: string; title: string; description: string | null }> {
    const highPriorityTasks = tasks.filter((task) => {
      const text = `${task.title} ${task.description || ''}`.toLowerCase();
      return HIGH_PRIORITY_KEYWORDS.some((keyword) => text.includes(keyword));
    });

    if (highPriorityTasks.length > 0) {
      return highPriorityTasks.slice(0, 5);
    }

    return tasks.slice(0, 5);
  }

  private requireDependency<T>(dependency: T | undefined, name: string): T {
    if (!dependency) {
      throw new Error(`${name} is required for morning briefing generation.`);
    }
    return dependency;
  }

  private safeString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : fallback;
  }
}
