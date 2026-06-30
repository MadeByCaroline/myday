import { NotionSyncService } from './notion-sync.service';

describe('NotionSyncService', () => {
  function createService() {
    const prisma = {
      integrationLink: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      oAuthToken: {
        findFirst: jest.fn(),
      },
    };

    const tasksService = {
      upsertTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
    };

    const notionOAuth = {
      queryDatabase: jest.fn(),
    };

    const configService = {
      get: jest.fn().mockReturnValue(null),
    };

    const service = new NotionSyncService(
      prisma as any,
      tasksService as any,
      notionOAuth as any,
      configService as any,
    );

    return { service, prisma, tasksService, notionOAuth };
  }

  describe('syncLinkById', () => {
    it('does nothing when link is not found', async () => {
      const { service, prisma } = createService();
      prisma.integrationLink.findUnique.mockResolvedValue(null);
      await service.syncLinkById('missing-link');
      expect(prisma.oAuthToken.findFirst).not.toHaveBeenCalled();
    });

    it('does nothing when link is inactive', async () => {
      const { service, prisma } = createService();
      prisma.integrationLink.findUnique.mockResolvedValue({
        id: 'link-1',
        active: false,
        userId: 'user-1',
        sourceId: 'db-id',
        workspaceId: 'ws-1',
      });
      await service.syncLinkById('link-1');
      expect(prisma.oAuthToken.findFirst).not.toHaveBeenCalled();
    });

    it('does nothing when no Notion token is found for the user', async () => {
      const { service, prisma, notionOAuth } = createService();
      prisma.integrationLink.findUnique.mockResolvedValue({
        id: 'link-1',
        active: true,
        userId: 'user-1',
        sourceId: 'db-id',
        workspaceId: 'ws-1',
      });
      prisma.oAuthToken.findFirst.mockResolvedValue(null);
      await service.syncLinkById('link-1');
      expect(notionOAuth.queryDatabase).not.toHaveBeenCalled();
    });

    it('upserts tasks for each page in the database', async () => {
      const { service, prisma, tasksService, notionOAuth } = createService();
      prisma.integrationLink.findUnique.mockResolvedValue({
        id: 'link-1',
        active: true,
        userId: 'user-1',
        sourceId: 'db-abc',
        workspaceId: 'ws-1',
      });
      prisma.oAuthToken.findFirst.mockResolvedValue({
        accessToken: 'notion-token',
      });

      notionOAuth.queryDatabase.mockResolvedValue([
        {
          id: 'page-1',
          properties: {
            Name: {
              type: 'title',
              title: [{ plain_text: 'My Notion Task' }],
            },
            Status: {
              type: 'status',
              status: { name: 'In Progress' },
            },
          },
        },
        {
          id: 'page-2',
          properties: {
            Name: {
              type: 'title',
              title: [{ plain_text: 'Another Task' }],
            },
          },
        },
      ]);

      await service.syncLinkById('link-1');

      expect(notionOAuth.queryDatabase).toHaveBeenCalledWith('notion-token', 'db-abc');
      expect(tasksService.upsertTask).toHaveBeenCalledTimes(2);
      expect(tasksService.upsertTask).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          externalId: 'notion_page_page-1',
          title: 'My Notion Task',
          source: 'notion',
          status: 'IN_PROGRESS',
        }),
      );
      expect(tasksService.upsertTask).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          externalId: 'notion_page_page-2',
          title: 'Another Task',
          source: 'notion',
        }),
      );
    });

    it('skips pages with no title', async () => {
      const { service, prisma, tasksService, notionOAuth } = createService();
      prisma.integrationLink.findUnique.mockResolvedValue({
        id: 'link-1',
        active: true,
        userId: 'user-1',
        sourceId: 'db-abc',
        workspaceId: null,
      });
      prisma.oAuthToken.findFirst.mockResolvedValue({
        accessToken: 'notion-token',
      });
      notionOAuth.queryDatabase.mockResolvedValue([
        {
          id: 'page-no-title',
          properties: {
            Status: { type: 'status', status: { name: 'Done' } },
          },
        },
      ]);

      await service.syncLinkById('link-1');
      expect(tasksService.upsertTask).not.toHaveBeenCalled();
    });

    it('maps Notion status values to MyDay statuses', async () => {
      const { service, prisma, tasksService, notionOAuth } = createService();
      prisma.integrationLink.findUnique.mockResolvedValue({
        id: 'link-1',
        active: true,
        userId: 'user-1',
        sourceId: 'db-abc',
        workspaceId: null,
      });
      prisma.oAuthToken.findFirst.mockResolvedValue({ accessToken: 'tok' });

      const statuses = [
        { notion: 'Done', expected: 'DONE' },
        { notion: 'Not Started', expected: 'TODO' },
        { notion: 'In Progress', expected: 'IN_PROGRESS' },
      ];

      for (const { notion, expected } of statuses) {
        notionOAuth.queryDatabase.mockResolvedValue([
          {
            id: `page-${notion}`,
            properties: {
              Name: { type: 'title', title: [{ plain_text: 'Task' }] },
              Status: { type: 'status', status: { name: notion } },
            },
          },
        ]);
        tasksService.upsertTask.mockClear();
        await service.syncLinkById('link-1');
        expect(tasksService.upsertTask).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ status: expected }),
        );
      }
    });
  });
});
