import { Module } from '@nestjs/common';
import { FocusController } from './focus.controller';
import { FocusService } from './focus.service';
import { GoogleService } from '../integrations/google.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [FocusController],
  providers: [FocusService, GoogleService, MicrosoftService],
  exports: [FocusService],
})
export class FocusModule {}
