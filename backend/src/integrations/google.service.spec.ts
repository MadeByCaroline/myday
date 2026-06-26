let mockColorsGet: jest.Mock;
let mockEventsList: jest.Mock;
let mockSetCredentials: jest.Mock;
let mockOAuth2: jest.Mock;
let mockCalendar: jest.Mock;

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: function (this: unknown, ...args: unknown[]) {
        return mockOAuth2(...args);
      },
    },
    calendar: (...args: unknown[]) => mockCalendar(...args),
  },
}));

import type { ConfigService } from '@nestjs/config';
import { GoogleService } from './google.service';

describe('GoogleService', () => {
  beforeEach(() => {
    mockColorsGet = jest.fn();
    mockEventsList = jest.fn();
    mockSetCredentials = jest.fn();
    mockOAuth2 = jest.fn().mockImplementation(() => ({
      setCredentials: mockSetCredentials,
    }));
    mockCalendar = jest.fn().mockReturnValue({
      colors: { get: mockColorsGet },
      events: { list: mockEventsList },
    });
  });

  it('calls Google /colors and /primary/events and maps unified events', async () => {
    mockColorsGet.mockResolvedValue({
      data: {
        event: {
          '1': { background: '#abc' },
        },
      },
    });
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'event-1',
            summary: 'Daily Standup',
            start: { dateTime: '2026-06-26T09:00:00Z' },
            end: { dateTime: '2026-06-26T09:15:00Z' },
            location: 'Room A',
            htmlLink: 'https://calendar.google.com/event?eid=1',
          },
        ],
      },
    });

    const configService = {
      getOrThrow: jest.fn((key: string) => key),
    };
    const service = new GoogleService(
      configService as unknown as ConfigService,
    );

    await expect(
      service.getTodayEvents('access-token', 'refresh-token'),
    ).resolves.toEqual([
      {
        id: 'event-1',
        title: 'Daily Standup',
        start: '2026-06-26T09:00:00Z',
        end: '2026-06-26T09:15:00Z',
        provider: 'GOOGLE',
        location: 'Room A',
        link: 'https://calendar.google.com/event?eid=1',
      },
    ]);

    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(mockColorsGet).toHaveBeenCalledTimes(1);
    expect(mockEventsList).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
      }),
    );
  });
});
