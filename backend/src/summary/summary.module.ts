import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MicrosoftService } from '../integrations/microsoft.service';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';
import { TokenRefreshQueueService } from './token-refresh.queue.service';

@Module({
  imports: [MailModule, CalendarModule, AiModule, UsersModule, SettingsModule],
  providers: [MicrosoftService, SummaryService, TokenRefreshQueueService],
  controllers: [SummaryController],
})
export class SummaryModule {}
