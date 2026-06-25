import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MicrosoftService } from '../integrations/microsoft.service';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { SummaryController } from './summary.controller';

@Module({
  imports: [MailModule, CalendarModule, AiModule, UsersModule],
  providers: [MicrosoftService],
  controllers: [SummaryController],
})
export class SummaryModule {}
