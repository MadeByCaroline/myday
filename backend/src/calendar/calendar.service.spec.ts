import { ConfigService } from '@nestjs/config';
import { CalendarService } from './calendar.service';
import { IntegrationProviderError } from '../integrations/integration-provider.error';
import type { GoogleService } from '../integrations/google.service';
import type { MicrosoftService } from '../integrations/microsoft.service';
import type { UsersService } from '../users/users.service';
import type { WorkspacesService } from '../workspaces/workspaces.service';

describe('CalendarService', () => {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('value'),
  } as unknown as ConfigService;

  it('merges provider events and attaches workspace metadata for each connected account', async () => {
    const usersService = {
      getOAuthTokens: jest.fn().mockResolvedValue([
        {
          provider: 'google',
          accessToken: 'google-token',
          refreshToken: 'google-refresh',
          workspaceId: 'work',
        },
        {
          provider: 'MICROSOFT',
          accessToken: 'microsoft-token',
          workspaceId: 'family',
        },
      ]),
    };
    const workspacesService = {
      listWorkspaces: jest.fn().mockResolvedValue([
        { id: 'work', name: 'Work' },
        { id: 'family', name: 'Family' },
      ]),
    };
    const googleService = {
      getTodayEvents: jest.fn().mockResolvedValue([
        {
          id: 'g-1',
          title: 'Roadmap review',
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
          title: 'Doctor appointment',
          start: '2026-06-26T09:00:00.000Z',
          end: '2026-06-26T09:30:00.000Z',
          provider: 'MICROSOFT',
        },
      ]),
    };

    const service = new CalendarService(
      configService,
      usersService as unknown as UsersService,
      googleService as unknown as GoogleService,
      microsoftService as unknown as MicrosoftService,
      workspacesService as unknown as WorkspacesService,
    );

    await expect(service.getTodayWorkspaceEvents('user-1')).resolves.toEqual([
      {
        id: 'm-1',
        title: 'Doctor appointment',
        start: '2026-06-26T09:00:00.000Z',
        end: '2026-06-26T09:30:00.000Z',
        provider: 'MICROSOFT',
        workspaceId: 'family',
        workspaceName: 'Family',
      },
      {
        id: 'g-1',
        title: 'Roadmap review',
        start: '2026-06-26T11:00:00.000Z',
        end: '2026-06-26T11:30:00.000Z',
        provider: 'GOOGLE',
        workspaceId: 'work',
        workspaceName: 'Work',
      },
    ]);

    expect(usersService.getOAuthTokens).toHaveBeenCalledWith('user-1');
    expect(workspacesService.listWorkspaces).toHaveBeenCalledWith('user-1');
    expect(googleService.getTodayEvents).toHaveBeenCalledWith(
      'google-token',
      'google-refresh',
    );
    expect(microsoftService.getTodayEvents).toHaveBeenCalledWith(
      'microsoft-token',
    );
  });

  it('throws an explicit provider error when the Google Calendar API fails', async () => {
    const service = new CalendarService(
      configService,
      {} as UsersService,
      {} as GoogleService,
      {} as MicrosoftService,
      {} as WorkspacesService,
    );

    await expect(
      service.getEventsForRange(
        'access-token',
        'refresh-token',
        new Date('2026-06-26T00:00:00.000Z'),
        new Date('2026-06-26T23:59:59.000Z'),
      ),
    ).rejects.toEqual(IntegrationProviderError.unavailable('GOOGLE'));
  });
});
