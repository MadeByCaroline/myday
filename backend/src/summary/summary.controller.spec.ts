import { SummaryController } from './summary.controller';

describe('SummaryController', () => {
  it('aggregates emails and events from all connected Google accounts', async () => {
    const mailService = {
      getRecentEmails: jest
        .fn()
        .mockResolvedValueOnce([{ subject: 'A' }])
        .mockResolvedValueOnce([{ subject: 'B' }]),
    };
    const calendarService = {
      getTodayEvents: jest
        .fn()
        .mockResolvedValueOnce([{ id: '1' }])
        .mockResolvedValueOnce([{ id: '2' }]),
    };
    const aiService = {
      analyzeProductivityData: jest.fn().mockResolvedValue({ summary: 'ok' }),
    };
    const usersService = {
      getAllOAuthTokens: jest.fn().mockResolvedValue([
        { provider: 'google', accessToken: 'token-1', refreshToken: 'refresh-1' },
        { provider: 'google', accessToken: 'token-2', refreshToken: 'refresh-2' },
      ]),
    };
    const microsoftService = {
      getUnreadEmails: jest.fn().mockResolvedValue([]),
    };

    const controller = new SummaryController(
      mailService as any,
      calendarService as any,
      aiService as any,
      usersService as any,
      microsoftService as any,
    );

    await controller.generateSummary({ user: { id: 'user-1' } });

    expect(usersService.getAllOAuthTokens).toHaveBeenCalledWith('user-1');
    expect(mailService.getRecentEmails).toHaveBeenCalledTimes(2);
    expect(calendarService.getTodayEvents).toHaveBeenCalledTimes(2);
    expect(microsoftService.getUnreadEmails).not.toHaveBeenCalled();
    expect(aiService.analyzeProductivityData).toHaveBeenCalledWith(
      [{ subject: 'A' }, { subject: 'B' }],
      [{ id: '1' }, { id: '2' }],
    );
  });

  it('aggregates emails from Google and Microsoft accounts together', async () => {
    const mailService = {
      getRecentEmails: jest.fn().mockResolvedValue([{ subject: 'Gmail' }]),
    };
    const calendarService = {
      getTodayEvents: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
    };
    const aiService = {
      analyzeProductivityData: jest.fn().mockResolvedValue({ summary: 'ok' }),
    };
    const usersService = {
      getAllOAuthTokens: jest.fn().mockResolvedValue([
        { provider: 'google', accessToken: 'g-token', refreshToken: 'g-refresh' },
        { provider: 'MICROSOFT', accessToken: 'ms-token', refreshToken: null },
      ]),
    };
    const microsoftService = {
      getUnreadEmails: jest.fn().mockResolvedValue([{ subject: 'Outlook' }]),
    };

    const controller = new SummaryController(
      mailService as any,
      calendarService as any,
      aiService as any,
      usersService as any,
      microsoftService as any,
    );

    await controller.generateSummary({ user: { id: 'user-1' } });

    expect(mailService.getRecentEmails).toHaveBeenCalledTimes(1);
    expect(microsoftService.getUnreadEmails).toHaveBeenCalledWith('ms-token');
    expect(aiService.analyzeProductivityData).toHaveBeenCalledWith(
      [{ subject: 'Gmail' }, { subject: 'Outlook' }],
      [{ id: 'event-1' }],
    );
  });

  it('returns a clear error when no accounts are connected', async () => {
    const controller = new SummaryController(
      { getRecentEmails: jest.fn() } as any,
      { getTodayEvents: jest.fn() } as any,
      { analyzeProductivityData: jest.fn() } as any,
      { getAllOAuthTokens: jest.fn().mockResolvedValue([]) } as any,
      { getUnreadEmails: jest.fn() } as any,
    );

    await expect(
      controller.generateSummary({ user: { id: 'user-1' } }),
    ).resolves.toEqual({
      error: 'No OAuth token found. Please reconnect your Google account.',
    });
  });
});
