import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { EmailSyncService } from '../integrations/email-sync.service';
import { GmailAdapter } from '../integrations/gmail.adapter';
import { ImapAdapter } from '../integrations/imap.adapter';
import { MicrosoftService } from '../integrations/microsoft.service';
import { MicrosoftAdapter } from '../integrations/microsoft.adapter';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';
import { TokenRefreshQueueService } from './token-refresh.queue.service';

@Module({
  imports: [MailModule, CalendarModule, AiModule, SettingsModule],
  providers: [
    MicrosoftService,
    GmailAdapter,
    MicrosoftAdapter,
    ImapAdapter,
    EmailSyncService,
    SummaryService,
    TokenRefreshQueueService,
  ],
  controllers: [SummaryController],
})
export class SummaryModule {}
