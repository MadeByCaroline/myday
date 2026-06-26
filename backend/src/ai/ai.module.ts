import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { MicrosoftService } from '../integrations/microsoft.service';
import { MailModule } from '../mail/mail.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [MailModule, CalendarModule, TasksModule],
  controllers: [AiController],
  providers: [AiService, MicrosoftService],
  exports: [AiService],
})
export class AiModule {}
