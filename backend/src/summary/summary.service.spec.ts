import axios from 'axios';
import { SummaryService } from './summary.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/unbound-method
const getAxiosPostMock = () => axios.post as jest.Mock;

describe('SummaryService', () => {
  const prisma = {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    oAuthToken: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const configService = {
    getOrThrow: jest.fn(),
  };

  const settingsService = {
    getSettings: jest.fn().mockResolvedValue({
      aiSummaryInstructions: null,
      excludedSenders: [],
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReset();
    prisma.user.findMany.mockReset();
    prisma.user.update.mockReset();
    prisma.oAuthToken.findMany.mockReset();
    prisma.oAuthToken.update.mockReset();
    getAxiosPostMock().mockReset();
    settingsService.getSettings.mockResolvedValue({
      aiSummaryInstructions: null,
      excludedSenders: [],
    });
  });

  function createService() {
    return new SummaryService(
      prisma as any,
      { getRecentEmails: jest.fn() } as any,
      { getTodayEvents: jest.fn() } as any,
      { getUnreadEmails: jest.fn(), getTodayEvents: jest.fn() } as any,
      { analyzeProductivityData: jest.fn() } as any,
      configService as any,
      settingsService as any,
    );
  }

  it('aggregates provider data, generates a summary, and stores it on the user', async () => {
    prisma.oAuthToken.findMany.mockResolvedValue([
      {
        id: 'google-token',
        provider: 'google',
        accessToken: 'google-access',
        refreshToken: 'google-refresh',
        expiresAt: null,
      },
      {
        id: 'ms-token',
        provider: 'MICROSOFT',
        accessToken: 'ms-access',
        refreshToken: 'ms-refresh',
        expiresAt: null,
      },
    ]);

    const mailService = {
      getRecentEmails: jest
        .fn()
        .mockResolvedValue([{ subject: 'Google mail' }]),
    };
    const calendarService = {
      getTodayEvents: jest.fn().mockResolvedValue([{ id: 'google-event' }]),
    };
    const microsoftService = {
      getUnreadEmails: jest
        .fn()
        .mockResolvedValue([{ subject: 'Outlook mail' }]),
      getTodayEvents: jest.fn().mockResolvedValue([
        {
          id: 'ms-event',
          title: 'Standup',
          start: '2026-06-26T09:00:00.000Z',
          end: '2026-06-26T09:15:00.000Z',
          provider: 'MICROSOFT',
          location: 'Teams',
        },
      ]),
    };
    const aiService = {
      analyzeProductivityData: jest.fn().mockResolvedValue({
        summary: 'Generated summary',
        events: [],
        suggested_tasks: [],
        email_summaries: [],
      }),
    };
    const service = new SummaryService(
      prisma as any,
      mailService as any,
      calendarService as any,
      microsoftService as any,
      aiService as any,
      configService as any,
      settingsService as any,
    );

    await expect(
      service.generateSummaryForUser('user-1'),
    ).resolves.toMatchObject({
      summary: 'Generated summary',
    });

    expect(prisma.oAuthToken.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
    });
    expect(mailService.getRecentEmails).toHaveBeenCalledWith(
      'google-access',
      'google-refresh',
    );
    expect(calendarService.getTodayEvents).toHaveBeenCalledWith(
      'google-access',
      'google-refresh',
    );
    expect(microsoftService.getUnreadEmails).toHaveBeenCalledWith('ms-access');
    expect(microsoftService.getTodayEvents).toHaveBeenCalledWith('ms-access');
    expect(aiService.analyzeProductivityData).toHaveBeenCalledWith(
      [{ subject: 'Google mail' }, { subject: 'Outlook mail' }],
      [
        { id: 'google-event' },
        {
          id: 'ms-event',
          title: 'Standup',
          start: '2026-06-26T09:00:00.000Z',
          end: '2026-06-26T09:15:00.000Z',
          location: 'Teams',
        },
      ],
      null,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { dailySummary: 'Generated summary' },
    });
  });

  it('returns a clear error when no OAuth accounts are connected', async () => {
    prisma.oAuthToken.findMany.mockResolvedValue([]);
    const service = createService();

    await expect(service.generateSummaryForUser('user-1')).resolves.toEqual({
      error:
        'No OAuth token found. Please connect a Google or Outlook account.',
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refreshes expired Microsoft tokens before fetching account data', async () => {
    prisma.oAuthToken.findMany.mockResolvedValue([
      {
        id: 'ms-token',
        provider: 'MICROSOFT',
        accessToken: 'stale-access',
        refreshToken: 'stale-refresh',
        expiresAt: new Date(Date.now() - 60_000),
      },
    ]);
    configService.getOrThrow.mockImplementation((key: string) => key);
    getAxiosPostMock().mockResolvedValue({
      data: {
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        expires_in: 3600,
      },
    });

    const microsoftService = {
      getUnreadEmails: jest.fn().mockResolvedValue([]),
      getTodayEvents: jest.fn().mockResolvedValue([]),
    };
    const aiService = {
      analyzeProductivityData: jest.fn().mockResolvedValue({
        summary: 'Refreshed summary',
        events: [],
        suggested_tasks: [],
        email_summaries: [],
      }),
    };
    const service = new SummaryService(
      prisma as any,
      { getRecentEmails: jest.fn() } as any,
      { getTodayEvents: jest.fn() } as any,
      microsoftService as any,
      aiService as any,
      configService as any,
      settingsService as any,
    );

    await service.generateSummaryForUser('user-1');

    expect(getAxiosPostMock()).toHaveBeenCalledTimes(1);
    expect(prisma.oAuthToken.update).toHaveBeenCalledWith({
      where: { id: 'ms-token' },
      data: {
        accessToken: 'fresh-access',
        refreshToken: 'fresh-refresh',
        expiresAt: expect.any(Date) as Date,
      },
    });
    expect(microsoftService.getUnreadEmails).toHaveBeenCalledWith(
      'fresh-access',
    );
    expect(microsoftService.getTodayEvents).toHaveBeenCalledWith(
      'fresh-access',
    );
  });

  it('continues generating summaries when one user fails in the cron job', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-a' },
      { id: 'user-b' },
    ]);
    const service = createService();
    const generateSpy = jest
      .spyOn(service, 'generateSummaryForUser')
      .mockRejectedValueOnce(new Error('token expired'))
      .mockResolvedValueOnce({ summary: 'ok' } as any);

    await expect(
      service.generateDailySummariesForAllUsers(),
    ).resolves.toBeUndefined();

    expect(generateSpy).toHaveBeenNthCalledWith(1, 'user-a');
    expect(generateSpy).toHaveBeenNthCalledWith(2, 'user-b');
  });
});
