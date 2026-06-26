import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { MicrosoftService } from '../integrations/microsoft.service';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';

@Module({
  imports: [AiModule, CalendarModule, MailModule, PrismaModule, UsersModule],
  controllers: [EmailsController],
  providers: [EmailsService, MicrosoftService],
})
export class EmailsModule {}
