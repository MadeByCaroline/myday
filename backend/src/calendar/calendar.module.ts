import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { GoogleService } from '../integrations/google.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [UsersModule, WorkspacesModule],
  controllers: [CalendarController],
  providers: [CalendarService, GoogleService, MicrosoftService],
  exports: [CalendarService],
})
export class CalendarModule {}
