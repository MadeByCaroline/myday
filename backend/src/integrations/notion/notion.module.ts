import { Module } from '@nestjs/common';
import { TasksModule } from '../../tasks/tasks.module';
import { NotionController } from './notion.controller';
import { NotionOAuthService } from './notion-oauth.service';
import { NotionSyncService } from './notion-sync.service';

@Module({
  imports: [TasksModule],
  controllers: [NotionController],
  providers: [NotionOAuthService, NotionSyncService],
  exports: [NotionSyncService],
})
export class NotionModule {}
