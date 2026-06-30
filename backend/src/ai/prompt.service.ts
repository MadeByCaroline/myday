import { Injectable } from '@nestjs/common';
import type { CalendarEvent } from '../calendar/calendar.service';
import type { EmailSummary } from '../integrations/gmail.client';
import type {
  MorningBriefingContext,
  TimeBlockingTaskInput,
  WorkspaceChatHistoryMessage,
} from './ai.types';

const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 500;
const DISALLOWED_INSTRUCTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/giu,
  /\b(system|assistant|developer)\s*:[^\n\r]*/giu,
];

@Injectable()
export class PromptService {
  buildAnalysisPrompt(
    emails: EmailSummary[],
    events: CalendarEvent[],
    aiSummaryInstructions?: string | null,
  ): string {
    const sanitized = this.sanitizeAiSummaryInstructions(aiSummaryInstructions);
    const customInstructionsLine = sanitized
      ? `\nInstructions personnalisées de l'utilisateur (concernant uniquement le format ou le style du résumé) : ${sanitized}`
      : '';

    const systemPrompt = `Tu es un assistant de productivité personnel. Analyse les emails et les événements de l'agenda de l'utilisateur.
    Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS.${customInstructionsLine}
    You must return a JSON object.
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

    return `${systemPrompt}\n\n${userContent}`;
  }

  buildDraftReplyPrompt(
    email: { from: string; subject: string; snippet: string; body: string },
    action: string,
    events: CalendarEvent[],
  ): string {
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

    return `${systemPrompt}\n\n${userContent}`;
  }

  buildMorningBriefingPrompt(
    context: MorningBriefingContext,
    userId: string,
  ): string {
    const systemPrompt = `Tu es un assistant exécutif préparant un court briefing matinal pour l'utilisateur.
Utilise un ton encourageant, bienveillant et concis.
Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS.

Retourne UNIQUEMENT un objet JSON valide avec EXACTEMENT cette structure, sans aucune autre explication ou texte en dehors du bloc JSON :
You must return a JSON object.
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

    return `${systemPrompt}\n\n${userPrompt}`;
  }

  buildTimeBlockingPrompt(
    tasks: TimeBlockingTaskInput[],
    calendarEvents: CalendarEvent[],
  ): string {
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

    const userContent = `Unified tasks and events with workspace metadata:
${JSON.stringify(unifiedAgenda, null, 2)}

Schedule the tasks into the free time slots and return the JSON array.`;

    return `${systemPrompt}\n\n${userContent}`;
  }

  buildTimeAuditPrompt(statsData: {
    totalDuration: number;
    taskStats: Array<{
      taskTitle: string;
      taskStatus: string;
      totalDuration: number;
    }>;
  }): string {
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
You must return a JSON object.
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

    return `${systemPrompt}\n\n${userContent}`;
  }

  buildWorkspaceChatPrompt(
    prompt: string,
    history: WorkspaceChatHistoryMessage[],
  ): string {
    const systemPrompt =
      "Tu es l'assistant de l'espace de travail de l'utilisateur. Rédige TOUT ton contenu, tes réponses et tes titres en FRANÇAIS. Réponds avec un ton encourageant, professionnel et concis.";
    return [
      `Instructions système : ${systemPrompt}`,
      ...history.map(
        (message) =>
          `${message.role === 'assistant' ? 'Assistant' : 'Utilisateur'}: ${message.content}`,
      ),
      `Utilisateur: ${prompt}`,
    ].join('\n');
  }

  sanitizeAiSummaryInstructions(instructions?: string | null): string | null {
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
}
