import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { GithubWebhookService } from './github-webhook.service';

describe('GithubWebhookService', () => {
  function createService() {
    const prisma = {
      integrationLink: {
        findFirst: jest.fn(),
      },
    };

    const tasksService = {
      upsertTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
    };

    const workspacesService = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('ws-1'),
    };

    const service = new GithubWebhookService(
      prisma as any,
      tasksService as any,
      workspacesService as any,
    );

    return { service, prisma, tasksService };
  }

  function makeSignature(body: Buffer, secret: string) {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  }

  describe('verifySignature', () => {
    it('throws UnauthorizedException when signature is missing', () => {
      const { service } = createService();
      const body = Buffer.from('{}');
      expect(() => service.verifySignature(body, undefined, 'secret')).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for an invalid signature', () => {
      const { service } = createService();
      const body = Buffer.from('{}');
      expect(() =>
        service.verifySignature(body, 'sha256=invalid', 'secret'),
      ).toThrow(UnauthorizedException);
    });

    it('passes for a valid signature', () => {
      const { service } = createService();
      const body = Buffer.from('{"action":"assigned"}');
      const sig = makeSignature(body, 'mysecret');
      expect(() =>
        service.verifySignature(body, sig, 'mysecret'),
      ).not.toThrow();
    });
  });

  describe('handleIssueEvent', () => {
    const secret = 'webhook-secret';

    function makePayload(action = 'assigned') {
      return {
        action,
        issue: {
          number: 42,
          title: 'Fix the bug',
          body: 'Details here',
          html_url: 'https://github.com/owner/repo/issues/42',
        },
        repository: { full_name: 'owner/repo' },
        assignee: { login: 'dev1' },
      };
    }

    it('returns processed:false when action is not "assigned"', async () => {
      const { service } = createService();
      const payload = makePayload('opened');
      const body = Buffer.from(JSON.stringify(payload));
      const result = await service.handleIssueEvent(body, undefined, payload);
      expect(result).toEqual({ processed: false });
    });

    it('returns processed:false when no integration link is found', async () => {
      const { service, prisma } = createService();
      prisma.integrationLink.findFirst.mockResolvedValue(null);
      const payload = makePayload();
      const body = Buffer.from(JSON.stringify(payload));
      const result = await service.handleIssueEvent(body, undefined, payload);
      expect(result).toEqual({ processed: false });
    });

    it('creates a task and returns processed:true for a valid event', async () => {
      const { service, prisma, tasksService } = createService();
      prisma.integrationLink.findFirst.mockResolvedValue({
        id: 'link-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        config: JSON.stringify({ webhookSecret: secret }),
      });

      const payload = makePayload();
      const body = Buffer.from(JSON.stringify(payload));
      const sig = makeSignature(body, secret);

      const result = await service.handleIssueEvent(body, sig, payload);

      expect(result).toEqual({ processed: true });
      expect(tasksService.upsertTask).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          externalId: 'github_issue_owner_repo_42',
          title: 'Fix the bug',
          source: 'github',
        }),
      );
    });

    it('throws UnauthorizedException when signature is wrong', async () => {
      const { service, prisma } = createService();
      prisma.integrationLink.findFirst.mockResolvedValue({
        id: 'link-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        config: JSON.stringify({ webhookSecret: 'correct-secret' }),
      });

      const payload = makePayload();
      const body = Buffer.from(JSON.stringify(payload));

      await expect(
        service.handleIssueEvent(body, 'sha256=wrong', payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when repository.full_name is missing', async () => {
      const { service } = createService();
      const payload = {
        action: 'assigned',
        issue: { number: 1, title: 'T', html_url: 'url', body: null },
        repository: { full_name: '' },
        assignee: null,
      };
      const body = Buffer.from(JSON.stringify(payload));
      await expect(
        service.handleIssueEvent(body, undefined, payload),
      ).rejects.toThrow(BadRequestException);
    });

    it('filters by label when config.filterLabel is set', async () => {
      const { service, prisma, tasksService } = createService();
      prisma.integrationLink.findFirst.mockResolvedValue({
        id: 'link-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        config: JSON.stringify({ webhookSecret: secret, filterLabel: 'bug' }),
      });

      const payloadWithoutLabel = {
        action: 'assigned',
        issue: {
          number: 1,
          title: 'No label',
          html_url: 'url',
          body: null,
          labels: [],
        },
        repository: { full_name: 'owner/repo' },
        assignee: { login: 'dev' },
      };
      const body = Buffer.from(JSON.stringify(payloadWithoutLabel));
      const sig = makeSignature(body, secret);

      const result = await service.handleIssueEvent(
        body,
        sig,
        payloadWithoutLabel,
      );
      expect(result).toEqual({ processed: false });
      expect(tasksService.upsertTask).not.toHaveBeenCalled();
    });
  });
});
