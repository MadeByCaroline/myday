import { SummaryController } from './summary.controller';

describe('SummaryController', () => {
  it('aggregates emails and events from connected Google and Outlook accounts', async () => {
    const mailService = {
      getRecentEmails: jest.fn().mockResolvedValueOnce([{ subject: 'A' }]),
    };
    const calendarService = {
      getTodayEvents: jest.fn().mockResolvedValueOnce([{ id: '1' }]),
    };
    const microsoftService = {
      getUnreadEmails: jest.fn().mockResolvedValueOnce([{ subject: 'B' }]),
    };
    const aiService = {
      analyzeProductivityData: jest.fn().mockResolvedValue({ summary: 'ok' }),
    };
    const usersService = {
      getOAuthTokens: jest.fn().mockResolvedValue([
        {
          provider: 'google',
          accessToken: 'token-1',
          refreshToken: 'refresh-1',
        },
        { provider: 'MICROSOFT', accessToken: 'token-2' },
      ]),
    };

    const controller = new SummaryController(
      mailService as any,
      calendarService as any,
      microsoftService as any,
      aiService as any,
      usersService as any,
    );

    await controller.generateSummary({ user: { id: 'user-1' } });

    expect(usersService.getOAuthTokens).toHaveBeenCalledWith('user-1');
    expect(mailService.getRecentEmails).toHaveBeenCalledTimes(1);
    expect(calendarService.getTodayEvents).toHaveBeenCalledTimes(1);
    expect(microsoftService.getUnreadEmails).toHaveBeenCalledWith('token-2');
    expect(aiService.analyzeProductivityData).toHaveBeenCalledWith(
      [{ subject: 'A' }, { subject: 'B' }],
      [{ id: '1' }],
    );
  });

  it('returns a clear error when no OAuth accounts are connected', async () => {
    const controller = new SummaryController(
      { getRecentEmails: jest.fn() } as any,
      { getTodayEvents: jest.fn() } as any,
      { getUnreadEmails: jest.fn() } as any,
      { analyzeProductivityData: jest.fn() } as any,
      { getOAuthTokens: jest.fn().mockResolvedValue([]) } as any,
    );

    await expect(
      controller.generateSummary({ user: { id: 'user-1' } }),
    ).resolves.toEqual({
      error:
        'No OAuth token found. Please connect a Google or Outlook account.',
    });
  });
});
