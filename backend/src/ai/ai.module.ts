import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { MicrosoftService } from '../integrations/microsoft.service';
import { MailModule } from '../mail/mail.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { BriefingService } from './briefing.service';
import { AiChatService } from './chat.service';
import { AI_PROVIDERS } from './core/ai-provider.interface';
import { GeminiAiProvider } from './core/providers/gemini-ai.provider';
import { LocalAiProvider } from './core/providers/local-ai.provider';
import { PromptService } from './prompt.service';

@Module({
  imports: [MailModule, CalendarModule, TasksModule],
  controllers: [AiController],
  providers: [
    AiService,
    MicrosoftService,
    PromptService,
    BriefingService,
    AiChatService,
    GeminiAiProvider,
    LocalAiProvider,
    {
      provide: AI_PROVIDERS,
      useFactory: (
        geminiProvider: GeminiAiProvider,
        localProvider: LocalAiProvider,
      ) => [geminiProvider, localProvider],
      inject: [GeminiAiProvider, LocalAiProvider],
    },
  ],
  exports: [AiService, PromptService, BriefingService, AiChatService],
})
export class AiModule {}
