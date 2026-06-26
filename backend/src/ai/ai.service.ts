import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { CalendarEvent } from '../calendar/calendar.service';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import { CalendarService } from '../calendar/calendar.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import { EmailSummary } from '../mail/mail.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

const EMAIL_CATEGORIES = [
  'URGENT',
  'NEWSLETTER',
  'INVOICE',
  'ACTION_REQUIRED',
  'INFO',
] as const;
const HIGH_PRIORITY_KEYWORDS = [
  'high',
  'priority',
  'urgent',
  'asap',
  'important',
  'p1',
];

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export interface CategorizedEmailSummary {
  emailId: string;
  summary: string;
  category: EmailCategory;
  suggestedActions: string[];
}

export interface AiAnalysisResult {
  summary: string;
  events: CalendarEvent[];
  suggested_tasks: Array<{
    title: string;
    description: string;
    source: string;
  }>;
  email_summaries: CategorizedEmailSummary[];
}

export interface TimeBlock {
  taskId: string;
  suggestedStartTime: string;
  suggestedEndTime: string;
  title: string;
}

export interface WorkspaceDateRange {
  start: string;
  end: string;
}

export interface WorkspaceChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkspaceChatToolset {
  getCalendar: (dateRange: WorkspaceDateRange) => Promise<unknown>;
  getTasks: (status?: string) => Promise<unknown>;
  getTimeEntries: (
    dateRange?: WorkspaceDateRange,
    projectId?: string,
  ) => Promise<unknown>;
}

export interface MorningBriefingResult {
  greeting: string;
  emailSummary: string;
  scheduleOverview: string;
  recommendedFocus: string;
}

type AiProvider = 'local' | 'gemini';

interface ResolveAIRequestOptions {
  isJson?: boolean;
  history?: WorkspaceChatHistoryMessage[];
  tools?: WorkspaceChatToolset;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly morningBriefingCache = new Map<
    string,
    { dateKey: string; briefing: MorningBriefingResult }
  >();

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
    events: CalendarEvent[],
  ): Promise<AiAnalysisResult> {
    const systemPrompt = `Tu es un assistant de productivité personnel. Analyse les emails et les événements de l'agenda de l'utilisateur. 
    Rédige TOUT ton contenu (résumé, titres, descriptions) en FRANÇAIS.
    Retourne UNIQUEMENT un objet JSON avec EXACTEMENT cette structure, rien d'autre :
    {
      "summary": "Un résumé clair de 2 ou 3 paragraphes de la journée de l'utilisateur, incluant les réunions et emails clés (rédigé en français)",
      "events": [le tableau des événements fourni, inchangé],
      "suggested_tasks": [
        {
          "title": "Titre court de la tâche (en français)",
          "description": "Pourquoi cette tâche est suggérée (en français)",
          "source": "email ou calendrier"
        }
      ],
      "email_summaries": [
        {
          "emailId": "id exact de l'email fourni en entrée",
          "summary": "Résumé en 1 phrase de l'email (en français)",
          "category": "URGENT | NEWSLETTER | INVOICE | ACTION_REQUIRED | INFO",
          "suggestedActions": [
            "Action courte 1 en français",
            "Action courte 2 en français",
            "Action courte 3 en français"
          ]
        }
      ]
    }`;

    const userContent = `Here are my emails from the last 24 hours:
${emails.length > 0 ? JSON.stringify(emails, null, 2) : 'No emails in the last 24 hours.'}

Here are my calendar events for today:
${events.length > 0 ? JSON.stringify(events, null, 2) : 'No calendar events today.'}

Please analyze and return the JSON response.`;

    try {
      const content = await this.resolveAIRequest(
        `${systemPrompt}\n\n${userContent}`,
        { isJson: true },
      );
      const parsedResult = JSON.parse(content) as AiAnalysisResult;

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
          'Unable to generate AI summary at this time. Please check your Gemini configuration.',
        events,
        suggested_tasks: [],
        email_summaries: this.buildFallbackEmailSummaries(emails),
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
    events: CalendarEvent[];
  }): Promise<string> {
    const systemPrompt = `Tu es un assistant email. Rédige uniquement le corps d'une réponse email professionnelle et polie en FRANÇAIS.
Ne produis ni objet, ni signature fictive, ni markdown, ni explication.
Tiens compte de l'action demandée et des disponibilités du calendrier pour proposer une réponse cohérente et concise.`;

    const userContent = `Email d'origine :
De : ${email.from}
Sujet : ${email.subject}
Extrait : ${email.snippet}
Contenu :
${email.body}

Action choisie :
${action}

Contexte calendrier :
${events.length > 0 ? JSON.stringify(events, null, 2) : 'Aucun événement pertinent trouvé.'}`;

    try {
      const content = await this.resolveAIRequest(
        `${systemPrompt}\n\n${userContent}`,
      );
      return content || this.buildFallbackDraftReply(action);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Gemini API error';
      this.logger.error('AI draft generation error', message);
      return this.buildFallbackDraftReply(action);
    }
  }

  async generateMorningBriefing(userId: string): Promise<MorningBriefingResult> {
    const todayKey = new Date().toISOString().slice(0, 10);
    this.pruneMorningBriefingCache(todayKey);
    const cached = this.morningBriefingCache.get(userId);
    if (cached?.dateKey === todayKey) {
      return cached.briefing;
    }

    const context = await this.getMorningBriefingContext(userId);

    const systemPrompt = `You are an executive assistant preparing a short morning briefing.
Use an encouraging, concise tone.
Return ONLY valid JSON with exactly this structure:
{
  "greeting": "short encouraging greeting",
  "emailSummary": "summary of unread emails from the last 12 hours",
  "scheduleOverview": "overview of today's schedule",
  "recommendedFocus": "1 clear recommended focus for today"
}`;

    const userPrompt = `Context for user ${userId}:
- Unread emails from last 12 hours:
${context.unreadEmails.length > 0 ? JSON.stringify(context.unreadEmails, null, 2) : '[]'}
- Today's calendar events:
${context.todayEvents.length > 0 ? JSON.stringify(context.todayEvents, null, 2) : '[]'}
- High-priority TODO tasks:
${context.highPriorityTodoTasks.length > 0 ? JSON.stringify(context.highPriorityTodoTasks, null, 2) : '[]'}
Generate the JSON response now.`;

    let briefing: MorningBriefingResult;
    try {
      const response = await this.resolveAIRequest(
        `${systemPrompt}\n\n${userPrompt}`,
        { isJson: true },
      );
      briefing = this.normalizeMorningBriefing(
        this.parseMorningBriefingResponse(response),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown morning briefing generation error';
      this.logger.error('AI morning briefing error', message);
      briefing = this.buildFallbackMorningBriefing(context);
    }

    this.morningBriefingCache.set(userId, { dateKey: todayKey, briefing });
    return briefing;
  }

  async answerWorkspaceQuestion(params: {
    prompt: string;
    history?: WorkspaceChatHistoryMessage[];
    tools: WorkspaceChatToolset;
  }): Promise<string> {
    try {
      const workspacePrompt = [
        ...(params.history || []).map(
          (message) =>
            `${message.role === 'assistant' ? 'Assistant' : 'Utilisateur'}: ${message.content}`,
        ),
        `Utilisateur: ${params.prompt}`,
      ].join('\n');
      const text = await this.resolveAIRequest(workspacePrompt, {
        history: params.history,
        tools: params.tools,
      });
      return text || 'I was unable to formulate a response at this time.';
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown AI provider error';
      this.logger.error('AI workspace chat error', message);
      return "I'm experiencing a temporary issue responding to your question.";
    }
  }

  async generateTimeBlocking(
    tasks: Array<{ id: string; title: string; description?: string | null }>,
    calendarEvents: CalendarEvent[],
  ): Promise<TimeBlock[]> {
    const systemPrompt = `Tu es un assistant exécutif expert en gestion du temps. 
Analyse les tâches ouvertes et les événements du calendrier pour aujourd'hui.
Trouve les créneaux libres dans la journée (heures de travail : 9h00-18h00, pause déjeuner : 12h30-13h30).
Attribue chaque tâche à un créneau disponible, en estimant 30 minutes par tâche sauf indication contraire.
Ne chevauche pas les événements existants.
Rédige les titres en FRANÇAIS.
Retourne UNIQUEMENT un tableau JSON avec EXACTEMENT cette structure, rien d'autre :
[
  {
    "taskId": "id exact de la tâche",
    "suggestedStartTime": "HH:MM",
    "suggestedEndTime": "HH:MM",
    "title": "titre de la tâche"
  }
]`;

    const userContent = `Tâches ouvertes à planifier :
${JSON.stringify(tasks, null, 2)}

Événements déjà présents dans le calendrier d'aujourd'hui :
${calendarEvents.length > 0 ? JSON.stringify(calendarEvents, null, 2) : "Aucun événement pour aujourd'hui."}

Planifie les tâches dans les créneaux libres et retourne le tableau JSON.`;

    try {
      const content = await this.resolveAIRequest(
        `${systemPrompt}\n\n${userContent}`,
        { isJson: true },
      );
      const parsed = JSON.parse(content) as unknown;

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
      return this.generateWorkspaceQuestionWithGemini(prompt, options);
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

  private buildLocalPrompt(
    prompt: string,
    options: ResolveAIRequestOptions,
  ): string {
    if (!options.isJson) {
      return prompt;
    }

    return `${prompt}

IMPORTANT: Return ONLY raw JSON. Do not wrap it in markdown fences, labels, or explanations.`;
  }

  private async generateWorkspaceQuestionWithGemini(
    prompt: string,
    options: ResolveAIRequestOptions,
  ): Promise<string> {
    const tools = options.tools;
    if (!tools) {
      throw new Error('Workspace tools are required for Gemini chat requests.');
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [
        {
          functionDeclarations: [
            {
              name: 'getCalendar',
              description:
                'Get calendar events in a date range using ISO dates { start, end }.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  dateRange: {
                    type: SchemaType.OBJECT,
                    properties: {
                      start: { type: SchemaType.STRING },
                      end: { type: SchemaType.STRING },
                    },
                    required: ['start', 'end'],
                  },
                },
                required: ['dateRange'],
              },
            },
            {
              name: 'getTasks',
              description:
                'Get user tasks, optionally filtered by status (TODO, IN_PROGRESS, DONE).',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  status: { type: SchemaType.STRING },
                },
              },
            },
            {
              name: 'getTimeEntries',
              description:
                'Get time entries for a date range. Optional projectId can be provided to filter (mapped to taskId in current data model).',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  dateRange: {
                    type: SchemaType.OBJECT,
                    properties: {
                      start: { type: SchemaType.STRING },
                      end: { type: SchemaType.STRING },
                    },
                    required: ['start', 'end'],
                  },
                  projectId: { type: SchemaType.STRING },
                },
              },
            },
          ],
        },
      ],
    });

    const chat = model.startChat({
      history: (options.history || []).map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
    });

    let result = await chat.sendMessage(prompt);
    let remainingTurns = 5;

    while (remainingTurns > 0) {
      const functionCalls = result.response.functionCalls?.() || [];
      if (functionCalls.length === 0) {
        break;
      }

      const responses = await Promise.all(
        functionCalls.map(async (call) => {
          const args = call.args as {
            dateRange?: WorkspaceDateRange;
            status?: string;
            projectId?: string;
          };

          if (call.name === 'getCalendar' && args.dateRange) {
            return {
              functionResponse: {
                name: call.name,
                response: await tools.getCalendar(args.dateRange),
              },
            };
          }

          if (call.name === 'getTasks') {
            return {
              functionResponse: {
                name: call.name,
                response: await tools.getTasks(args.status),
              },
            };
          }

          if (call.name === 'getTimeEntries') {
            return {
              functionResponse: {
                name: call.name,
                response: await tools.getTimeEntries(
                  args.dateRange,
                  args.projectId,
                ),
              },
            };
          }

          return {
            functionResponse: {
              name: call.name,
              response: {
                error: `Unsupported tool call: ${call.name}`,
              },
            },
          };
        }),
      );

      result = await chat.sendMessage(responses as any);
      remainingTurns -= 1;
    }

    return result.response.text().trim();
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
        return {
          emailId: emailId || `email-${index + 1}`,
          summary,
          category,
          suggestedActions,
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
        const parsed = JSON.parse(value) as unknown;
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
    return emails.map((email, index) => ({
      emailId: email.id || `fallback-email-${index + 1}`,
      summary: email.snippet || email.subject || 'No summary available.',
      category: 'INFO',
      suggestedActions: this.buildFallbackSuggestedActions(email),
    }));
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

  private async getMorningBriefingContext(userId: string): Promise<{
    unreadEmails: EmailSummary[];
    todayEvents: CalendarEvent[];
    highPriorityTodoTasks: Array<{
      id: string;
      title: string;
      description: string | null;
    }>;
  }> {
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
              microsoftService.getUnreadEmails(oauthToken.accessToken),
              microsoftService.getTodayEvents(oauthToken.accessToken),
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

  private normalizeMorningBriefing(value: unknown): MorningBriefingResult {
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
        'Good morning! Here is your plan for the day.',
      ),
      emailSummary: this.safeString(
        data.emailSummary,
        'No unread emails from the last 12 hours.',
      ),
      scheduleOverview: this.safeString(
        data.scheduleOverview,
        "You don't have calendar events for today.",
      ),
      recommendedFocus: this.safeString(
        data.recommendedFocus,
        'Start with your top TODO task to build momentum.',
      ),
    };
  }

  private buildFallbackMorningBriefing(context: {
    unreadEmails: EmailSummary[];
    todayEvents: CalendarEvent[];
    highPriorityTodoTasks: Array<{ title: string }>;
  }): MorningBriefingResult {
    const topTask =
      context.highPriorityTodoTasks[0]?.title || 'your top TODO task';

    return {
      greeting: 'Good morning! You’re set up for a strong start.',
      emailSummary:
        context.unreadEmails.length > 0
          ? `You have ${context.unreadEmails.length} unread email(s) from the last 12 hours.`
          : 'No unread emails from the last 12 hours.',
      scheduleOverview:
        context.todayEvents.length > 0
          ? `You have ${context.todayEvents.length} event(s) on your calendar today.`
          : "Your calendar is open today, so you can create focused time blocks.",
      recommendedFocus: `Prioritize ${topTask} first, then batch email follow-ups.`,
    };
  }

  private safeString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : fallback;
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

  private pruneMorningBriefingCache(todayKey: string): void {
    for (const [cachedUserId, cacheValue] of this.morningBriefingCache.entries()) {
      if (cacheValue.dateKey !== todayKey) {
        this.morningBriefingCache.delete(cachedUserId);
      }
    }
  }

  private parseMorningBriefingResponse(response: string): unknown {
    try {
      return JSON.parse(response) as unknown;
    } catch {
      throw new Error('AI returned invalid morning briefing JSON.');
    }
  }
}
