import { SummaryService } from './summary.service';
import { TokenRefreshQueueService } from './token-refresh.queue.service';

describe('SummaryService', () => {
  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    emailAccount: {
      findMany: jest.fn(),
    },
    oAuthToken: {
      update: jest.fn(),
    },
  };

  const settingsService = {
    getSettings: jest.fn().mockResolvedValue({
      aiSummaryInstructions: null,
      excludedSenders: [],
    }),
  };

  const emailSyncService = {
    syncForUser: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ dailySummary: null });
    settingsService.getSettings.mockResolvedValue({
      aiSummaryInstructions: null,
      excludedSenders: [],
    });
  });

  function createService(aiService?: { analyzeProductivityData: jest.Mock }) {
    return new SummaryService(
      prisma as any,
      { getRecentEmails: jest.fn() } as any,
      { getTodayEvents: jest.fn() } as any,
      { getUnreadEmails: jest.fn(), getTodayEvents: jest.fn() } as any,
      (aiService || {
        analyzeProductivityData: jest.fn().mockResolvedValue({
          summary: 'Generated summary',
          events: [],
          suggested_tasks: [],
          email_summaries: [],
        }),
      }) as any,
      { getOrThrow: jest.fn() } as any,
      settingsService as any,
      emailSyncService as any,
      new TokenRefreshQueueService(),
    );
  }

  it('aggregates synced account data and stores summary', async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: 'a1', provider: 'GOOGLE' },
      { id: 'a2', provider: 'MICROSOFT' },
    ]);
    emailSyncService.syncForUser.mockResolvedValue([
      {
        account: {
          provider: 'GOOGLE',
          label: 'Perso',
          emailAddress: 'p@example.com',
        },
        status: 'ready',
        emails: [{ subject: 'Google mail' }],
        events: [{ id: 'g-event' }],
      },
      {
        account: {
          provider: 'MICROSOFT',
          label: 'Pro',
          emailAddress: 'm@example.com',
        },
        status: 'ready',
        emails: [{ subject: 'Outlook mail' }],
        events: [{ id: 'm-event' }],
      },
    ]);

    const aiService = {
      analyzeProductivityData: jest.fn().mockResolvedValue({
        summary: 'Generated summary',
        events: [],
        suggested_tasks: [],
        email_summaries: [],
      }),
    };

    const service = createService(aiService as any);

    await expect(service.generateSummaryForUser('user-1')).resolves.toMatchObject({
      summary: 'Generated summary',
    });

    expect(aiService.analyzeProductivityData).toHaveBeenCalledWith(
      [{ subject: 'Google mail' }, { subject: 'Outlook mail' }],
      [{ id: 'g-event' }, { id: 'm-event' }],
      null,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { dailySummary: 'Generated summary' },
    });
  });

  it('returns a clear error when no email accounts are connected', async () => {
    prisma.emailAccount.findMany.mockResolvedValue([]);
    const service = createService();

    await expect(service.generateSummaryForUser('user-1')).resolves.toEqual({
      error:
        'No email account found. Please connect Google, Outlook, or an IMAP account.',
      integrations: [],
    });
  });

  it('returns cached summary when all account syncs fail', async () => {
    prisma.user.findUnique.mockResolvedValue({ dailySummary: 'Cached summary' });
    prisma.emailAccount.findMany.mockResolvedValue([{ id: 'a1', provider: 'IMAP' }]);
    emailSyncService.syncForUser.mockResolvedValue([
      {
        account: {
          provider: 'IMAP',
          label: 'Yahoo',
          emailAddress: 'user@yahoo.com',
        },
        status: 'error',
        code: 'provider_unavailable',
        message: 'Les données IMAP sont temporairement indisponibles.',
        emails: [],
        events: [],
      },
    ]);

    const service = createService();

    await expect(service.generateSummaryForUser('user-1')).resolves.toEqual({
      summary: 'Cached summary',
      events: [],
      suggested_tasks: [],
      email_summaries: [],
      integrations: [
        {
          provider: 'IMAP',
          status: 'error',
          code: 'provider_unavailable',
          message: 'Les données IMAP sont temporairement indisponibles.',
          label: 'Yahoo',
          emailAddress: 'user@yahoo.com',
        },
      ],
      usedCachedSummary: true,
      error:
        'Les données de vos intégrations sont temporairement indisponibles. Affichage du dernier résumé enregistré.',
    });
  });

  it('matches excluded sender domains precisely', async () => {
    settingsService.getSettings.mockResolvedValue({
      aiSummaryInstructions: null,
      excludedSenders: ['@news.com'],
    });
    prisma.emailAccount.findMany.mockResolvedValue([{ id: 'a1', provider: 'IMAP' }]);
    emailSyncService.syncForUser.mockResolvedValue([
      {
        account: {
          provider: 'IMAP',
          label: 'Inbox',
          emailAddress: 'user@example.com',
        },
        status: 'ready',
        emails: [
          { from: 'Alerts <team@news.com>', subject: 'skip' },
          { from: 'John <john@newsletter.com>', subject: 'keep-1' },
          { from: 'Updates <updates@realnews.com>', subject: 'keep-2' },
        ],
        events: [],
      },
    ]);

    const aiService = {
      analyzeProductivityData: jest.fn().mockResolvedValue({
        summary: 'Résumé généré',
        events: [],
        suggested_tasks: [],
        email_summaries: [],
      }),
    };
    const service = createService(aiService as any);

    await service.generateSummaryForUser('user-1');

    expect(aiService.analyzeProductivityData).toHaveBeenCalledWith(
      [
        { from: 'John <john@newsletter.com>', subject: 'keep-1' },
        { from: 'Updates <updates@realnews.com>', subject: 'keep-2' },
      ],
      [],
      null,
    );
  });
});
