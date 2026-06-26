import { CalendarController } from './calendar.controller';
import type { CalendarService } from './calendar.service';

describe('CalendarController', () => {
  it('returns today events enriched with workspace metadata', async () => {
    const calendarService = {
      getTodayWorkspaceEvents: jest.fn().mockResolvedValue([
        {
          id: 'm-1',
          title: 'Microsoft Event',
          start: '2026-06-26T09:00:00.000Z',
          end: '2026-06-26T09:30:00.000Z',
          provider: 'MICROSOFT',
          workspaceId: 'work',
          workspaceName: 'Work',
        },
        {
          id: 'g-1',
          title: 'Google Event',
          start: '2026-06-26T11:00:00.000Z',
          end: '2026-06-26T11:30:00.000Z',
          provider: 'GOOGLE',
          workspaceId: 'family',
          workspaceName: 'Family',
        },
      ]),
    };

    const controller = new CalendarController(
      calendarService as unknown as CalendarService,
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
        workspaceId: 'work',
        workspaceName: 'Work',
      },
      {
        id: 'g-1',
        title: 'Google Event',
        start: '2026-06-26T11:00:00.000Z',
        end: '2026-06-26T11:30:00.000Z',
        provider: 'GOOGLE',
        workspaceId: 'family',
        workspaceName: 'Family',
      },
    ]);

    expect(calendarService.getTodayWorkspaceEvents).toHaveBeenCalledWith(
      'user-1',
    );
  });
});
