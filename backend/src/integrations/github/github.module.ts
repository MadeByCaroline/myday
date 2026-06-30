import { Module } from '@nestjs/common';
import { TasksModule } from '../../tasks/tasks.module';
import { WorkspacesModule } from '../../workspaces/workspaces.module';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';

@Module({
  imports: [TasksModule, WorkspacesModule],
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService],
  exports: [GithubWebhookService],
})
export class GithubModule {}
