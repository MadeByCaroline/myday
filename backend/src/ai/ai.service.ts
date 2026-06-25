import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CalendarEvent } from '../calendar/calendar.service';
import { EmailSummary } from '../mail/mail.service';

export interface AiAnalysisResult {
  summary: string;
  events: CalendarEvent[];
  suggested_tasks: Array<{
    title: string;
    description: string;
    source: string;
  }>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.getOrThrow<string>('GEMINI_API_KEY'),
    );
  }

  async analyzeProductivityData(
    emails: EmailSummary[],
    events: CalendarEvent[],
  ): Promise<AiAnalysisResult> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

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
      ]
    }`;

    const userContent = `Here are my emails from the last 24 hours:
${emails.length > 0 ? JSON.stringify(emails, null, 2) : 'No emails in the last 24 hours.'}

Here are my calendar events for today:
${events.length > 0 ? JSON.stringify(events, null, 2) : 'No calendar events today.'}

Please analyze and return the JSON response.`;

    try {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userContent },
      ]);

      const content = result.response.text() || '{}';
      const parsedResult = JSON.parse(content) as AiAnalysisResult;

      if (!parsedResult.events || parsedResult.events.length === 0) {
        parsedResult.events = events;
      }

      if (!parsedResult.suggested_tasks) {
        parsedResult.suggested_tasks = [];
      }

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
      };
    }
  }
}
