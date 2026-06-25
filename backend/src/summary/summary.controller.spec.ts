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
      getOAuthTokens: jest.fn().mockResolvedValue([
        { accessToken: 'token-1', refreshToken: 'refresh-1' },
        { accessToken: 'token-2', refreshToken: 'refresh-2' },
      ]),
    };

    const controller = new SummaryController(
      mailService as any,
      calendarService as any,
      aiService as any,
      usersService as any,
    );

    await controller.generateSummary({ user: { id: 'user-1' } });

    expect(usersService.getOAuthTokens).toHaveBeenCalledWith(
      'user-1',
      'google',
    );
    expect(mailService.getRecentEmails).toHaveBeenCalledTimes(2);
    expect(calendarService.getTodayEvents).toHaveBeenCalledTimes(2);
    expect(aiService.analyzeProductivityData).toHaveBeenCalledWith(
      [{ subject: 'A' }, { subject: 'B' }],
      [{ id: '1' }, { id: '2' }],
    );
  });

  it('returns a clear error when no Google accounts are connected', async () => {
    const controller = new SummaryController(
      { getRecentEmails: jest.fn() } as any,
      { getTodayEvents: jest.fn() } as any,
      { analyzeProductivityData: jest.fn() } as any,
      { getOAuthTokens: jest.fn().mockResolvedValue([]) } as any,
    );

    await expect(
      controller.generateSummary({ user: { id: 'user-1' } }),
    ).resolves.toEqual({
      error: 'No OAuth token found. Please reconnect your Google account.',
    });
  });
});
