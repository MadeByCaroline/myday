import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { WorkspacesService } from '../../workspaces/workspaces.service';

export interface GithubIssuePayload {
  action: string;
  issue: {
    number: number;
    title: string;
    body?: string | null;
    html_url: string;
  };
  repository: {
    full_name: string;
  };
  assignee?: {
    login: string;
  } | null;
}

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  verifySignature(
    rawBody: Buffer,
    signature: string | undefined,
    secret: string,
  ): void {
    if (!signature) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256 header');
    }

    const expected =
      'sha256=' +
      createHmac('sha256', secret).update(rawBody).digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (
      expectedBuf.length !== signatureBuf.length ||
      !timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async handleIssueEvent(
    rawBody: Buffer,
    signature: string | undefined,
    payload: GithubIssuePayload,
  ): Promise<{ processed: boolean }> {
    if (payload.action !== 'assigned') {
      return { processed: false };
    }

    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
      throw new BadRequestException('Missing repository.full_name in payload');
    }

    const link = await this.prisma.integrationLink.findFirst({
      where: {
        type: 'github',
        sourceId: repoFullName,
        active: true,
      },
    });

    if (!link) {
      this.logger.debug(
        `No active integration link found for GitHub repo: ${repoFullName}`,
      );
      return { processed: false };
    }

    const config = this.parseConfig(link.config);
    this.verifySignature(rawBody, signature, config.webhookSecret || '');

    if (config.filterLabel) {
      const issue = await this.fetchIssueLabels(payload);
      const hasLabel = issue?.labels?.some(
        (l: { name: string }) =>
          l.name.toLowerCase() === config.filterLabel!.toLowerCase(),
      );
      if (!hasLabel) {
        return { processed: false };
      }
    }

    const externalId = `github_issue_${repoFullName.replace('/', '_')}_${payload.issue.number}`;
    const description = [
      payload.issue.html_url,
      payload.issue.body,
    ]
      .filter(Boolean)
      .join('\n\n');

    await this.tasksService.upsertTask(link.userId, {
      externalId,
      title: payload.issue.title,
      description: description || undefined,
      source: 'github',
      workspaceId: link.workspaceId,
    });

    this.logger.log(
      `Created/updated task for GitHub issue #${payload.issue.number} from ${repoFullName}`,
    );

    return { processed: true };
  }

  private parseConfig(configJson: string): {
    webhookSecret?: string;
    filterLabel?: string;
  } {
    try {
      return JSON.parse(configJson) as {
        webhookSecret?: string;
        filterLabel?: string;
      };
    } catch {
      return {};
    }
  }

  private fetchIssueLabels(
    payload: GithubIssuePayload,
  ): { labels?: Array<{ name: string }> } | null {
    const issue = payload.issue as GithubIssuePayload['issue'] & {
      labels?: Array<{ name: string }>;
    };
    return issue ?? null;
  }
}
