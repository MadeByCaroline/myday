import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { CalendarModule } from './calendar/calendar.module';
import { AiModule } from './ai/ai.module';
import { TasksModule } from './tasks/tasks.module';
import { TimeTrackingModule } from './time-tracking/time-tracking.module';
import { SummaryModule } from './summary/summary.module';
import { EmailsModule } from './emails/emails.module';
import { ChatModule } from './chat/chat.module';
import { ScheduleOptimizeModule } from './schedule/schedule.module';
import { PaymentsModule } from './payments/payments.module';
import { FocusModule } from './focus/focus.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SettingsModule } from './settings/settings.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    MailModule,
    CalendarModule,
    AiModule,
    TasksModule,
    TimeTrackingModule,
    SummaryModule,
    EmailsModule,
    ChatModule,
    ScheduleOptimizeModule,
    PaymentsModule,
    FocusModule,
    AnalyticsModule,
    SettingsModule,
    WorkspacesModule,
  ],
})
export class AppModule {}
