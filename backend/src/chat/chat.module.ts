import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { MicrosoftService } from '../integrations/microsoft.service';
import { TasksModule } from '../tasks/tasks.module';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';
import { UsersModule } from '../users/users.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AiModule, UsersModule, CalendarModule, TasksModule, TimeTrackingModule],
  controllers: [ChatController],
  providers: [ChatService, MicrosoftService],
})
export class ChatModule {}
