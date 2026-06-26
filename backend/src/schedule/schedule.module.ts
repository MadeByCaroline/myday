import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TasksModule } from '../tasks/tasks.module';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [AiModule, CalendarModule, TasksModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleOptimizeModule {}
