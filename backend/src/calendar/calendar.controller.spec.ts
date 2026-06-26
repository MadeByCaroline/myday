import { CalendarController } from './calendar.controller';
import type { GoogleService } from '../integrations/google.service';
import type { MicrosoftService } from '../integrations/microsoft.service';
import type { UsersService } from '../users/users.service';

describe('CalendarController', () => {
  it('merges and sorts today events across connected providers', async () => {
    const usersService = {
      getOAuthTokens: jest.fn().mockResolvedValue([
        {
          provider: 'google',
          accessToken: 'google-token',
          refreshToken: 'google-refresh',
        },
        {
          provider: 'MICROSOFT',
          accessToken: 'microsoft-token',
        },
      ]),
    };
    const googleService = {
      getTodayEvents: jest.fn().mockResolvedValue([
        {
          id: 'g-1',
          title: 'Google Event',
          start: '2026-06-26T11:00:00.000Z',
          end: '2026-06-26T11:30:00.000Z',
          provider: 'GOOGLE',
        },
      ]),
    };
    const microsoftService = {
      getTodayEvents: jest.fn().mockResolvedValue([
        {
          id: 'm-1',
          title: 'Microsoft Event',
          start: '2026-06-26T09:00:00.000Z',
          end: '2026-06-26T09:30:00.000Z',
          provider: 'MICROSOFT',
        },
      ]),
    };

    const controller = new CalendarController(
      usersService as unknown as UsersService,
      googleService as unknown as GoogleService,
      microsoftService as unknown as MicrosoftService,
    );

    await expect(
      controller.getTodayCalendar({ user: { id: 'user-1' } }),
    ).resolves.toEqual([
      {
        id: 'm-1',
        title: 'Microsoft Event',
        start: '2026-06-26T09:00:00.000Z',
        end: '2026-06-26T09:30:00.000Z',
        provider: 'MICROSOFT',
      },
      {
        id: 'g-1',
        title: 'Google Event',
        start: '2026-06-26T11:00:00.000Z',
        end: '2026-06-26T11:30:00.000Z',
        provider: 'GOOGLE',
      },
    ]);

    expect(usersService.getOAuthTokens).toHaveBeenCalledWith('user-1');
    expect(googleService.getTodayEvents).toHaveBeenCalledWith(
      'google-token',
      'google-refresh',
    );
    expect(microsoftService.getTodayEvents).toHaveBeenCalledWith(
      'microsoft-token',
    );
  });
});
