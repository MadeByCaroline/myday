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
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const systemPrompt = `You are a productivity assistant. Analyze the user's emails and calendar events.
Return ONLY a JSON object with EXACTLY this structure, nothing else:
{
  "summary": "A clear 2-3 paragraph summary of the user's day, including key emails and meetings",
  "events": [array of calendar events as provided, unchanged],
  "suggested_tasks": [
    {
      "title": "Short task title",
      "description": "Why this task is suggested",
      "source": "email or calendar"
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
