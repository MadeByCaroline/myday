import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { MicrosoftService } from '../integrations/microsoft.service';
import { MailModule } from '../mail/mail.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { BriefingService } from './briefing.service';
import { AiChatService } from './chat.service';
import { PromptService } from './prompt.service';

@Module({
  imports: [MailModule, CalendarModule, TasksModule],
  controllers: [AiController],
  providers: [AiService, MicrosoftService, PromptService, BriefingService, AiChatService],
  exports: [AiService, PromptService, BriefingService, AiChatService],
})
export class AiModule {}
