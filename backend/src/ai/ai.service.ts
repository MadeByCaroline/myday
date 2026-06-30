import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CalendarService } from '../calendar/calendar.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import type { EmailSummary } from '../integrations/gmail.client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import {
  EMAIL_CATEGORIES,
  type AiAnalysisResult,
  type CategorizedEmailSummary,
  type EmailCategory,
  type MorningBriefingResult,
  type TimeBlock,
  type TimeBlockingTaskInput,
  type WorkspaceChatHistoryMessage,
  type WorkspaceChatToolset,
  type WorkspaceDateRange,
} from './ai.types';
import { BriefingService } from './briefing.service';
import { AiChatService } from './chat.service';
import { PromptService } from './prompt.service';

export type {
  AiAnalysisResult,
  CategorizedEmailSummary,
  EmailCategory,
  MorningBriefingResult,
  TimeBlock,
  TimeBlockingTaskInput,
  WorkspaceChatHistoryMessage,
  WorkspaceChatToolset,
  WorkspaceDateRange,
} from './ai.types';

const GMAIL_INBOX_URL_PREFIX = 'https://mail.google.com/mail/u/0/#inbox/';

type AiProvider = 'local' | 'gemini';

interface ResolveAIRequestOptions {
  isJson?: boolean;
  history?: WorkspaceChatHistoryMessage[];
  tools?: WorkspaceChatToolset;
}

class AiParsingException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiParsingException';
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly promptService: PromptService;
  private readonly briefingService: BriefingService;
  private readonly aiChatService: AiChatService;

  constructor(
    private configService: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly mailService?: MailService,
    @Optional() private readonly calendarService?: CalendarService,
    @Optional() private readonly tasksService?: TasksService,
    @Optional() private readonly microsoftService?: MicrosoftService,
  ) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.getOrThrow<string>('GEMINI_API_KEY'),
    );
    this.promptService = new PromptService();
    this.briefingService = new BriefingService(
      this.prisma,
      this.mailService,
      this.calendarService,
      this.tasksService,
      this.microsoftService,
    );
    this.aiChatService = new AiChatService();
  }

  async generateContent(prompt: string): Promise<string> {
    const content = await this.resolveAIRequest(prompt);
    return content.trim();
  }

  async generateContentLocal(prompt: string): Promise<string> {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4',
          prompt: prompt,
          stream: false,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as { response?: string };
      if (typeof data.response !== 'string') {
        throw new Error('Unexpected response structure from Ollama API');
      }
      return data.response;
    } catch (error) {
      this.logger.error(
        'Local Ollama generation failed. Is the server running?',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async analyzeProductivityData(
    emails: EmailSummary[],
    events: import('../calendar/calendar.service').CalendarEvent[],
    aiSummaryInstructions?: string | null,
  ): Promise<AiAnalysisResult> {
    const prompt = this.promptService.buildAnalysisPrompt(
      emails,
      events,
      aiSummaryInstructions,
    );

    try {
      const rawAiResponse = await this.resolveAIRequest(prompt, { isJson: true });
      const parsedResult = this.parseJsonResponse<AiAnalysisResult>(
        rawAiResponse,
        'AI analysis',
      );

      if (!parsedResult.events || parsedResult.events.length === 0) {
        parsedResult.events = events;
      }

      if (!parsedResult.suggested_tasks) {
        parsedResult.suggested_tasks = [];
      }

      parsedResult.email_summaries = this.normalizeEmailSummaries(
        parsedResult.email_summaries,
        emails,
      );

      if (!parsedResult.summary) {
        parsedResult.summary = 'No summary was generated.';
      }

      return parsedResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gemini API error';
      this.logger.error('Gemini API error', message);
      return {
        summary:
          'Impossible de générer le résumé IA pour le moment. Vérifiez la configuration de Gemini.',
        events,
        suggested_tasks: [],
        email_summaries: this.buildFallbackEmailSummaries(emails),
        isFallback: true,
        fallbackReason: message,
      };
    }
  }

  async generateDraftReply({
    email,
    action,
    events,
  }: {
    email: {
      from: string;
      subject: string;
      snippet: string;
      body: string;
    };
    action: string;
    events: import('../calendar/calendar.service').CalendarEvent[];
  }): Promise<string> {
    const prompt = this.promptService.buildDraftReplyPrompt(
      email,
      action,
      events,
    );
    try {
      const content = await this.resolveAIRequest(prompt);
      return content || this.buildFallbackDraftReply(action);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gemini API error';
      this.logger.error('AI draft generation error', message);
      return this.buildFallbackDraftReply(action);
    }
  }

  async generateMorningBriefing(
    userId: string,
  ): Promise<MorningBriefingResult> {
    const todayKey = new Date().toISOString().slice(0, 10);
    this.briefingService.pruneCache(todayKey);
    const cached = this.briefingService.getFromCache(userId);
    if (cached?.dateKey === todayKey) {
      return cached.briefing;
    }

    const context =
      await this.briefingService.getMorningBriefingContext(userId);
    const prompt = this.promptService.buildMorningBriefingPrompt(
      context,
      userId,
    );

    let briefing: MorningBriefingResult;
    try {
      const response = await this.resolveAIRequest(prompt, { isJson: true });
      briefing = this.briefingService.normalizeMorningBriefing(
        this.briefingService.parseBriefingResponse(response),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown morning briefing generation error';
      this.logger.error('AI morning briefing error', message);
      briefing = {
        ...this.briefingService.buildFallbackMorningBriefing(context),
        isFallback: true,
        fallbackReason: message,
      };
    }

    this.briefingService.setInCache(userId, { dateKey: todayKey, briefing });
    return briefing;
  }

  async processMeetingNotes(notes: string): Promise<{
    linkedin: string;
    email: string;
    tasks: Array<{ title: string; dueDate: string | null; status: string }>;
  }> {
    const linkedinPrompt = this.promptService.buildLinkedInPostPrompt(notes);
    const emailPrompt = this.promptService.buildFollowUpEmailPrompt(notes);
    const taskListPrompt = this.promptService.buildMeetingTaskListPrompt(notes);

    const [linkedin, emailText, rawTasks] = await Promise.all([
      this.resolveAIRequest(linkedinPrompt).catch((error) => {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.error('LinkedIn post generation error', message);
        return '';
      }),
      this.resolveAIRequest(emailPrompt).catch((error) => {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.error('Follow-up email generation error', message);
        return '';
      }),
      this.resolveAIRequest(taskListPrompt, { isJson: true }).catch((error) => {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.error('Task list generation error', message);
        return '{"tasks":[]}';
      }),
    ]);

    let tasks: Array<{ title: string; dueDate: string | null; status: string }> =
      [];
    try {
      const parsed = this.parseJsonResponse<{
        tasks?: Array<{
          title?: unknown;
          dueDate?: unknown;
          status?: unknown;
        }>;
      }>(rawTasks, 'meeting task list');
      if (Array.isArray(parsed.tasks)) {
        tasks = parsed.tasks
          .filter(
            (t): t is { title: string; dueDate?: unknown; status?: unknown } =>
              typeof t === 'object' && t !== null && typeof t.title === 'string',
          )
          .map((t) => ({
            title: t.title,
            dueDate:
              typeof t.dueDate === 'string' &&
              t.dueDate.trim().length > 0 &&
              t.dueDate.trim().toLowerCase() !== 'null'
                ? t.dueDate.trim()
                : null,
            status: 'TODO',
          }));
      }
    } catch {
      tasks = [];
    }

    return { linkedin, email: emailText, tasks };
  }

  async answerWorkspaceQuestion(params: {
    prompt: string;
    history?: WorkspaceChatHistoryMessage[];
    tools: WorkspaceChatToolset;
  }): Promise<string> {
    try {
      const workspacePrompt = this.promptService.buildWorkspaceChatPrompt(
        params.prompt,
        params.history || [],
      );
      const text = await this.resolveAIRequest(workspacePrompt, {
        history: params.history,
        tools: params.tools,
      });
      return text || "Je n'ai pas pu formuler une réponse pour le moment.";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown AI provider error';
      this.logger.error('AI workspace chat error', message);
      return 'Je rencontre temporairement un problème pour répondre à votre question.';
    }
  }

  async generateTimeBlocking(
    tasks: TimeBlockingTaskInput[],
    calendarEvents: import('../calendar/calendar.service').CalendarEvent[],
  ): Promise<TimeBlock[]> {
    const prompt = this.promptService.buildTimeBlockingPrompt(
      tasks,
      calendarEvents,
    );
    try {
      const rawAiResponse = await this.resolveAIRequest(prompt, { isJson: true });
      const parsed = this.parseJsonResponse<unknown[] | Record<string, unknown>>(
        rawAiResponse,
        'AI time-blocking',
      );

      if (!Array.isArray(parsed)) {
        return this.buildFallbackTimeBlocks(tasks);
      }

      return (parsed as unknown[]).filter((item): item is TimeBlock => {
        const o = item as Record<string, unknown>;
        return (
          typeof o === 'object' &&
          o !== null &&
          typeof o.taskId === 'string' &&
          typeof o.suggestedStartTime === 'string' &&
          typeof o.suggestedEndTime === 'string' &&
          typeof o.title === 'string'
        );
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown AI provider error';
      this.logger.error('AI time-blocking error', message);
      return this.buildFallbackTimeBlocks(tasks);
    }
  }

  async generateTimeAudit(statsData: {
    totalDuration: number;
    taskStats: Array<{
      taskTitle: string;
      taskStatus: string;
      totalDuration: number;
    }>;
  }): Promise<{
    analysis: string;
    recommendations: string[];
    isFallback?: boolean;
    fallbackReason?: string;
  }> {
    const MAX_RECOMMENDATIONS = 2;
    const prompt = this.promptService.buildTimeAuditPrompt(statsData);

    try {
      const rawAiResponse = await this.resolveAIRequest(prompt, { isJson: true });
      const parsed = this.parseJsonResponse<{
        analysis?: unknown;
        recommendations?: unknown;
      }>(rawAiResponse, 'AI time audit');

      const analysis =
        typeof parsed.analysis === 'string' && parsed.analysis.trim().length > 0
          ? parsed.analysis.trim()
          : this.buildFallbackTimeAuditAnalysis(statsData);

      const recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter(
            (r): r is string => typeof r === 'string' && r.trim().length > 0,
          )
        : [];

      return {
        analysis,
        recommendations:
          recommendations.length > 0
            ? recommendations.slice(0, MAX_RECOMMENDATIONS)
            : this.buildFallbackRecommendations(),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown AI provider error';
      this.logger.error('AI time audit error', message);
      return {
        analysis: this.buildFallbackTimeAuditAnalysis(statsData),
        recommendations: this.buildFallbackRecommendations(),
        isFallback: true,
        fallbackReason: message,
      };
    }
  }

  private buildFallbackTimeAuditAnalysis(statsData: {
    totalDuration: number;
    taskStats: Array<{ taskTitle: string; totalDuration: number }>;
  }): string {
    const totalHours = (statsData.totalDuration / 3600).toFixed(1);
    if (statsData.taskStats.length === 0) {
      return "Aucune session de temps n'a été enregistrée cette semaine. Commencez à suivre vos tâches pour obtenir des analyses de productivité générées par l'IA.";
    }
    const topTask = statsData.taskStats[0];
    const topHours = (topTask.totalDuration / 3600).toFixed(1);
    return `Cette semaine, vous avez suivi un total de ${totalHours} heures sur ${statsData.taskStats.length} tâche(s). La tâche la plus chronophage a été "${topTask.taskTitle}" avec ${topHours} heures enregistrées. Vérifiez que la répartition de votre temps reste bien alignée avec vos priorités.`;
  }

  private buildFallbackRecommendations(): string[] {
    return [
      'Suivez régulièrement toutes vos sessions de travail pour obtenir des analyses plus fiables.',
      'Revoyez vos priorités chaque lundi afin de vérifier que votre temps soutient bien vos objectifs.',
    ];
  }

  private async resolveAIRequest(
    prompt: string,
    options: ResolveAIRequestOptions = {},
  ): Promise<string> {
    const preferredProvider: AiProvider =
      this.configService.get<string>('USE_LOCAL_AI') === 'true'
        ? 'local'
        : 'gemini';
    const providers: AiProvider[] =
      preferredProvider === 'local' ? ['local', 'gemini'] : ['gemini', 'local'];
    let lastError: unknown;

    for (const provider of providers) {
      try {
        return await this.generateByProvider(provider, prompt, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`${provider} AI request failed`, message);
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('No AI provider responded successfully.');
  }

  private async generateByProvider(
    provider: AiProvider,
    prompt: string,
    options: ResolveAIRequestOptions,
  ): Promise<string> {
    if (provider === 'local') {
      return this.generateContentLocal(this.buildLocalPrompt(prompt, options));
    }

    if (options.tools) {
      return this.aiChatService.generateWorkspaceAnswer(
        this.genAI,
        prompt,
        options.history || [],
        options.tools,
      );
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      ...(options.isJson
        ? {
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }
        : {}),
    });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }

  private cleanJsonResponse(response: string): string {
    return response
      .replace(/^\s*```(?:json)?\s*/iu, '')
      .replace(/\s*```\s*$/u, '')
      .trim();
  }

  private parseJsonResponse<T>(rawAiResponse: string, context: string): T {
    const cleanedResponse = this.cleanJsonResponse(rawAiResponse);

    try {
      return JSON.parse(cleanedResponse) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${context} JSON parsing failed`, message);
      this.logger.debug(`Raw AI response: ${rawAiResponse}`);
      throw new AiParsingException(`Invalid ${context} JSON response`);
    }
  }

  private buildLocalPrompt(
    prompt: string,
    options: ResolveAIRequestOptions,
  ): string {
    if (!options.isJson) {
      return prompt;
    }

    return `${prompt}

IMPORTANT : retourne UNIQUEMENT du JSON brut. N'ajoute ni balises markdown, ni libellé, ni explication, ni texte hors JSON.`;
  }

  private buildFallbackTimeBlocks(
    tasks: Array<{ id: string; title: string }>,
  ): TimeBlock[] {
    let hour = 9;
    return tasks.map((task) => {
      const start = `${String(hour).padStart(2, '0')}:00`;
      const end = `${String(hour).padStart(2, '0')}:30`;
      hour += 1;
      if (hour === 12) hour = 13;
      return {
        taskId: task.id,
        suggestedStartTime: start,
        suggestedEndTime: end,
        title: task.title,
      };
    });
  }

  private normalizeEmailSummaries(
    value: unknown,
    emails: EmailSummary[],
  ): CategorizedEmailSummary[] {
    const rawItems = this.parseEmailSummariesValue(value);
    if (!rawItems) {
      return this.buildFallbackEmailSummaries(emails);
    }

    const normalizedItems = rawItems
      .map((item, index) => {
        const emailId = this.getStringValue(item, 'emailId');
        const directMatch = emails.find((email) => email.id === emailId);
        const matchingEmail = directMatch || emails[index];
        if (!directMatch && matchingEmail) {
          this.logger.warn(
            `Falling back to positional email matching for summary item ${emailId || index + 1}`,
          );
        }
        const summary = this.getStringValue(item, 'summary');
        const category = this.normalizeCategory(
          this.getStringValue(item, 'category'),
        );
        const suggestedActions = this.normalizeSuggestedActions(
          item.suggestedActions,
          matchingEmail,
        );
        if (!summary) {
          return null;
        }
        const { senderName, senderEmail } = this.parseSender(
          matchingEmail?.from || '',
        );
        return {
          emailId: emailId || `email-${index + 1}`,
          summary,
          category,
          suggestedActions,
          senderName,
          senderEmail,
          subject: matchingEmail?.subject || '',
          link: this.buildEmailLink(matchingEmail),
        };
      })
      .filter((item): item is CategorizedEmailSummary => item !== null);

    return normalizedItems.length > 0
      ? normalizedItems
      : this.buildFallbackEmailSummaries(emails);
  }

  private parseEmailSummariesValue(
    value: unknown,
  ): Array<Record<string, unknown>> | null {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      );
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(this.cleanJsonResponse(value)) as unknown;
        if (!Array.isArray(parsed)) {
          return null;
        }
        return parsed.filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        );
      } catch {
        return null;
      }
    }
    return null;
  }

  private getStringValue(item: Record<string, unknown>, key: string): string {
    const value = item[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeSuggestedActions(
    value: unknown,
    email?: EmailSummary,
  ): string[] {
    const parsedActions = Array.isArray(value)
      ? value.filter((action): action is string => typeof action === 'string')
      : [];
    const seenActions = new Set<string>();
    const normalizedActions = parsedActions
      .map((action) => action.trim())
      .filter((action) => action.length > 0 && !seenActions.has(action))
      .map((action) => {
        seenActions.add(action);
        return action;
      })
      .slice(0, 3);

    return [
      ...normalizedActions,
      ...this.buildFallbackSuggestedActions(email),
    ].slice(0, 3);
  }

  private normalizeCategory(value: string): EmailCategory {
    const upperValue = value.toUpperCase();
    return EMAIL_CATEGORIES.includes(upperValue as EmailCategory)
      ? (upperValue as EmailCategory)
      : 'INFO';
  }

  private buildFallbackEmailSummaries(
    emails: EmailSummary[],
  ): CategorizedEmailSummary[] {
    return emails.map((email, index) => {
      const { senderName, senderEmail } = this.parseSender(email.from || '');
      return {
        emailId: email.id || `fallback-email-${index + 1}`,
        summary: email.snippet || email.subject || 'Résumé indisponible.',
        category: 'INFO',
        suggestedActions: this.buildFallbackSuggestedActions(email),
        senderName,
        senderEmail,
        subject: email.subject || '',
        link: this.buildEmailLink(email),
      };
    });
  }

  private parseSender(from: string): {
    senderName: string;
    senderEmail: string;
  } {
    const match = from.match(/^(.*?)\s*<([^>]+)>/u);
    if (match) {
      return {
        senderName: match[1].trim().replace(/^["']|["']$/g, ''),
        senderEmail: match[2].trim(),
      };
    }
    return { senderName: from.trim(), senderEmail: from.trim() };
  }

  private buildEmailLink(email?: EmailSummary): string {
    if (!email) {
      return '';
    }
    if (email.threadId) {
      return `${GMAIL_INBOX_URL_PREFIX}${email.threadId}`;
    }
    if (email.id) {
      return `${GMAIL_INBOX_URL_PREFIX}${email.id}`;
    }
    return '';
  }

  private buildFallbackSuggestedActions(email?: EmailSummary): string[] {
    const subject = email?.subject?.toLowerCase() || '';

    if (subject.includes('meeting') || subject.includes('rendez-vous')) {
      return [
        'Accepter pour le créneau proposé',
        'Proposer un autre créneau',
        'Demander plus de détails',
      ];
    }

    return [
      'Répondre poliment',
      'Demander plus de détails',
      'Proposer un suivi rapide',
    ];
  }

  private buildFallbackDraftReply(action: string): string {
    return `Bonjour,\n\nMerci pour votre message. ${action}.\n\nBien cordialement,`;
  }
}
