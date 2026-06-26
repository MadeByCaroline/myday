import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { AiModule } from '../ai/ai.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { GoogleService } from '../integrations/google.service';
import { MicrosoftService } from '../integrations/microsoft.service';

@Module({
  imports: [AiModule, TasksModule, UsersModule],
  controllers: [ScheduleController],
  providers: [GoogleService, MicrosoftService],
})
export class ScheduleOptimizeModule {}
