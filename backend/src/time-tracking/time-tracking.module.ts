import { Module } from '@nestjs/common';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeTrackingService } from './time-tracking.service';

@Module({
  providers: [TimeTrackingService],
  controllers: [TimeTrackingController],
  exports: [TimeTrackingService],
})
export class TimeTrackingModule {}
