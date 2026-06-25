import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CalendarEvent } from '../calendar/calendar.service';
import { EmailSummary } from '../mail/mail.service';

export interface AiAnalysisResult {
  summary: string;
  events: CalendarEvent[];
  suggested_tasks: Array<{ title: string; description: string; source: string }>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
  }

  async analyzeProductivityData(
    emails: EmailSummary[],
    events: CalendarEvent[],
  ): Promise<AiAnalysisResult> {
    const systemPrompt = `You are a productivity assistant. Analyze the user's emails and calendar events and return a JSON object with exactly this structure:
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
}
Return ONLY valid JSON, no markdown, no extra text.`;

    const userContent = `Here are my emails from the last 24 hours:
${emails.length > 0 ? JSON.stringify(emails, null, 2) : 'No emails in the last 24 hours.'}

Here are my calendar events for today:
${events.length > 0 ? JSON.stringify(events, null, 2) : 'No calendar events today.'}

Please analyze and return the JSON response.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content) as AiAnalysisResult;

      if (!result.events || result.events.length === 0) {
        result.events = events;
      }

      if (!result.suggested_tasks) {
        result.suggested_tasks = [];
      }

      if (!result.summary) {
        result.summary = 'No summary was generated.';
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown OpenAI API error';
      this.logger.error('OpenAI API error', message);
      return {
        summary: 'Unable to generate AI summary at this time. Please check your OpenAI API key configuration.',
        events,
        suggested_tasks: [],
      };
    }
  }
}
