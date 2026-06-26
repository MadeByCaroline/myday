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
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 500;
const DISALLOWED_INSTRUCTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/giu,
  /\b(system|assistant|developer)\s*:[^\n\r]*/giu,
];
const GMAIL_INBOX_URL_PREFIX = 'https://mail.google.com/mail/u/0/#inbox/';

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export interface CategorizedEmailSummary {
  emailId: string;
  summary: string;
  category: EmailCategory;
  suggestedActions: string[];
  senderName: string;
  senderEmail: string;
  subject: string;
  link: string;
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

export interface TimeBlockingTaskInput {
  id: string;
  title: string;
  description?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
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
    aiSummaryInstructions?: string | null,
  ): Promise<AiAnalysisResult> {
    const sanitizedSummaryInstructions =
      this.sanitizeAiSummaryInstructions(aiSummaryInstructions);
    const customInstructionsLine = sanitizedSummaryInstructions
      ? `\nInstructions personnalisées de l'utilisateur (concernant uniquement le format ou le style du résumé) : ${sanitizedSummaryInstructions}`
      : '';
    const systemPrompt = `Tu es un assistant de productivité personnel. Analyse les emails et les événements de l'agenda de l'utilisateur.
    Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS.${customInstructionsLine}
    Retourne UNIQUEMENT un objet JSON avec EXACTEMENT cette structure, rien d'autre. N'ajoute aucune explication, aucun commentaire et aucun texte hors du JSON :
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

    const userContent = `Voici mes e-mails des dernières 24 heures :
${emails.length > 0 ? JSON.stringify(emails, null, 2) : 'Aucun e-mail au cours des dernières 24 heures.'}

Voici mes événements de calendrier pour aujourd'hui :
${events.length > 0 ? JSON.stringify(events, null, 2) : "Aucun événement au calendrier aujourd'hui."}

Analyse ces éléments et retourne maintenant la réponse JSON.`;

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
          "Impossible de générer le résumé IA pour le moment. Vérifiez la configuration de Gemini.",
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
const systemPrompt = `Tu es un assistant email.
Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS.
Rédige uniquement le corps d'une réponse email professionnelle et polie.
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

    const systemPrompt = `Tu es un assistant exécutif préparant un court briefing matinal pour l'utilisateur.
Utilise un ton encourageant, bienveillant et concis.
Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS.

Retourne UNIQUEMENT un objet JSON valide avec EXACTEMENT cette structure, sans aucune autre explication ou texte en dehors du bloc JSON :
{
  "greeting": "Un court message d'accueil encourageant en français",
  "emailSummary": "Résumé synthétique des emails non lus des dernières 12 heures en français",
  "scheduleOverview": "Vue d'ensemble concise du planning de la journée en français",
  "recommendedFocus": "Un objectif clair de concentration prioritaire pour aujourd'hui en français"
}`;

    const userPrompt = `Contexte pour l'utilisateur ${userId} :
- E-mails non lus des 12 dernières heures :
${context.unreadEmails.length > 0 ? JSON.stringify(context.unreadEmails, null, 2) : '[]'}
- Événements du calendrier prévus aujourd'hui :
${context.todayEvents.length > 0 ? JSON.stringify(context.todayEvents, null, 2) : '[]'}
- Tâches TODO prioritaires :
${context.highPriorityTodoTasks.length > 0 ? JSON.stringify(context.highPriorityTodoTasks, null, 2) : '[]'}
Génère maintenant la réponse JSON.`;

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
      const systemPrompt =
        "Tu es l'assistant de l'espace de travail de l'utilisateur. Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS. Réponds avec un ton encourageant, professionnel et concis.";
      const workspacePrompt = [
        `Instructions système : ${systemPrompt}`,
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
      return (
        text ||
        "Je n'ai pas pu formuler une réponse pour le moment."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown AI provider error';
      this.logger.error('AI workspace chat error', message);
      return 'Je rencontre temporairement un problème pour répondre à votre question.';
    }
  }

  async generateTimeBlocking(
    tasks: TimeBlockingTaskInput[],
    calendarEvents: CalendarEvent[],
  ): Promise<TimeBlock[]> {
    const unifiedAgenda = [
      ...tasks.map((task) => ({
        kind: 'task' as const,
        id: task.id,
        title: task.title,
        description: task.description ?? null,
        workspaceId: task.workspaceId ?? null,
        workspaceName: task.workspaceName ?? null,
      })),
      ...calendarEvents.map((event) => ({
        kind: 'event' as const,
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        provider: event.provider ?? null,
        location: event.location ?? null,
        workspaceId: event.workspaceId ?? null,
        workspaceName: event.workspaceName ?? null,
      })),
    ];

    const systemPrompt = `You are an executive life coach. You must schedule the user's day across multiple workspaces.
Strict Rule: Never overlap tasks from different workspaces.
Respect hard-coded personal events (e.g., Family, Health) as absolute priority over flexible Work tasks.
Leave a 15-minute buffer between context switches (e.g., switching from Work to Family).
Analyze today's open tasks and calendar events.
Find free slots in the day (working hours: 9:00-18:00, lunch break: 12:30-13:30).
Assign each task to an available slot, estimating 30 minutes per task unless the task clearly implies a different duration.
Do not overlap existing calendar events.
Return ONLY a JSON array with EXACTLY this structure and nothing else. Do not add explanations, comments, or any text outside the JSON:
[
  {
    "taskId": "exact task id",
    "suggestedStartTime": "HH:MM",
    "suggestedEndTime": "HH:MM",
    "title": "task title"
  }
]`;

    const userContent = `Open tasks to schedule:
${JSON.stringify(tasks, null, 2)}

Calendar events already scheduled today:
${calendarEvents.length > 0 ? JSON.stringify(calendarEvents, null, 2) : 'No events for today.'}

Unified tasks and events with workspace metadata:
${JSON.stringify(unifiedAgenda, null, 2)}

Schedule the tasks into the free time slots and return the JSON array.`;

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

  async generateTimeAudit(statsData: {
    totalDuration: number;
    taskStats: Array<{
      taskTitle: string;
      taskStatus: string;
      totalDuration: number;
    }>;
  }): Promise<{ analysis: string; recommendations: string[] }> {
    const MAX_RECOMMENDATIONS = 2;
    const totalHours = (statsData.totalDuration / 3600).toFixed(1);
    const taskBreakdown = statsData.taskStats
      .map((stat) => {
        const hours = (stat.totalDuration / 3600).toFixed(1);
        const pct =
          statsData.totalDuration > 0
            ? Math.round((stat.totalDuration / statsData.totalDuration) * 100)
            : 0;
        return `- "${stat.taskTitle}" (status: ${stat.taskStatus}): ${hours}h (${pct}%)`;
      })
      .join('\n');

    const systemPrompt = `Tu es un coach de productivité expert en gestion du temps.
Analyse les données hebdomadaires de suivi du temps de l'utilisateur et fournis un bilan clair, actionnable et encourageant.
Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS.
Retourne UNIQUEMENT un objet JSON valide avec EXACTEMENT cette structure, rien d'autre. N'ajoute aucune explication, aucun commentaire et aucun texte hors du JSON :
{
  "analysis": "Une analyse en 2 ou 3 paragraphes de la manière dont l'utilisateur a réparti son temps cette semaine, mettant en avant les points positifs et les points d'attention",
  "recommendations": [
    "Première recommandation actionnable pour améliorer la productivité la semaine prochaine",
    "Deuxième recommandation actionnable pour améliorer la productivité la semaine prochaine"
  ]
}`;

    const userContent = `Voici mes données de suivi du temps sur les 7 derniers jours :
Temps total suivi : ${totalHours} heures

Répartition du temps par tâche :
${taskBreakdown || 'Aucune tâche suivie cette semaine.'}

Analyse ma répartition du temps et fournis ${MAX_RECOMMENDATIONS} recommandations actionnables pour améliorer ma productivité la semaine prochaine.`;

    try {
      const content = await this.resolveAIRequest(
        `${systemPrompt}\n\n${userContent}`,
        { isJson: true },
      );
      const parsed = JSON.parse(content) as {
        analysis?: unknown;
        recommendations?: unknown;
      };

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

IMPORTANT : retourne UNIQUEMENT du JSON brut. N'ajoute ni balises markdown, ni libellé, ni explication, ni texte hors JSON.`;
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
        const { senderName, senderEmail } = this.parseSender(matchingEmail?.from || '');
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

  private sanitizeAiSummaryInstructions(
    instructions?: string | null,
  ): string | null {
    if (!instructions) {
      return null;
    }

    const sanitized = DISALLOWED_INSTRUCTION_PATTERNS.reduce(
      (value, pattern) => value.replace(pattern, ''),
      instructions.replace(/[<>{}[\]\\]/g, ''),
    )
      .slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH)
      .trim();

    return sanitized.length > 0 ? sanitized : null;
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

  private parseSender(from: string): { senderName: string; senderEmail: string } {
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
        'Bonjour ! Voici votre plan pour la journée.',
      ),
      emailSummary: this.safeString(
        data.emailSummary,
        "Aucun e-mail non lu au cours des 12 dernières heures.",
      ),
      scheduleOverview: this.safeString(
        data.scheduleOverview,
        "Vous n'avez pas d'événements au calendrier aujourd'hui.",
      ),
      recommendedFocus: this.safeString(
        data.recommendedFocus,
        'Commencez par votre tâche TODO prioritaire pour prendre de l’élan.',
      ),
    };
  }

  private buildFallbackMorningBriefing(context: {
    unreadEmails: EmailSummary[];
    todayEvents: CalendarEvent[];
    highPriorityTodoTasks: Array<{ title: string }>;
  }): MorningBriefingResult {
    const topTask =
      context.highPriorityTodoTasks[0]?.title || 'votre tâche TODO prioritaire';

    return {
      greeting: 'Bonjour ! Tout est prêt pour bien démarrer.',
      emailSummary:
        context.unreadEmails.length > 0
          ? `Vous avez ${context.unreadEmails.length} e-mail(s) non lu(s) au cours des 12 dernières heures.`
          : "Aucun e-mail non lu au cours des 12 dernières heures.",
      scheduleOverview:
        context.todayEvents.length > 0
          ? `Vous avez ${context.todayEvents.length} événement(s) à votre calendrier aujourd'hui.`
          : "Votre calendrier est dégagé aujourd'hui, vous pouvez donc créer des plages de concentration.",
      recommendedFocus: `Donnez la priorité à ${topTask} d'abord, puis traitez vos suivis e-mail par lot.`,
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
