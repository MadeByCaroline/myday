let mockColorsGet: jest.Mock;
let mockEventsList: jest.Mock;
let mockEventsInsert: jest.Mock;
let mockEventsDelete: jest.Mock;
let mockSetCredentials: jest.Mock;
let mockRefreshAccessToken: jest.Mock;
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
    mockEventsInsert = jest.fn();
    mockEventsDelete = jest.fn();
    mockSetCredentials = jest.fn();
    mockRefreshAccessToken = jest.fn();
    mockOAuth2 = jest.fn().mockImplementation(() => ({
      setCredentials: mockSetCredentials,
      refreshAccessToken: mockRefreshAccessToken,
    }));
    mockCalendar = jest.fn().mockReturnValue({
      colors: { get: mockColorsGet },
      events: {
        list: mockEventsList,
        insert: mockEventsInsert,
        delete: mockEventsDelete,
      },
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
    const service = new GoogleService(configService as unknown as ConfigService);

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

  it('creates a private busy event for deep work sessions', async () => {
    mockEventsInsert.mockResolvedValue({
      data: {
        id: 'deep-work-event',
      },
    });

    const configService = {
      getOrThrow: jest.fn((key: string) => key),
    };
    const service = new GoogleService(configService as unknown as ConfigService);

    await expect(
      service.createBusyEvent(
        'access-token',
        'refresh-token',
        new Date('2026-06-26T14:00:00.000Z'),
        new Date('2026-06-26T15:00:00.000Z'),
        'Busy until 3:00 PM',
      ),
    ).resolves.toBe('deep-work-event');
    expect(mockEventsInsert).toHaveBeenCalledWith({
      calendarId: 'primary',
      requestBody: {
        summary: 'Deep Work',
        description: 'Busy until 3:00 PM',
        start: {
          dateTime: '2026-06-26T14:00:00.000Z',
        },
        end: {
          dateTime: '2026-06-26T15:00:00.000Z',
        },
        transparency: 'opaque',
        visibility: 'private',
      },
    });
  });

  it('deletes a deep work event from Google Calendar', async () => {
    const configService = {
      getOrThrow: jest.fn((key: string) => key),
    };
    const service = new GoogleService(configService as unknown as ConfigService);

    await service.deleteBusyEvent(
      'access-token',
      'refresh-token',
      'deep-work-event',
    );

    expect(mockEventsDelete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'deep-work-event',
    });
  });

  it('refreshes the Google token and retries when Calendar returns 401', async () => {
    mockColorsGet.mockResolvedValue({
      data: {
        event: {},
      },
    });
    mockEventsList
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({
        data: {
          items: [],
        },
      });
    mockRefreshAccessToken.mockResolvedValue({
      credentials: { access_token: 'fresh-access' },
    });
    const configService = {
      getOrThrow: jest.fn((key: string) => key),
    };
    const service = new GoogleService(configService as unknown as ConfigService);

    await expect(
      service.getTodayEvents('stale-access', 'refresh-token'),
    ).resolves.toEqual([]);

    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockOAuth2).toHaveBeenCalledTimes(3);
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: 'fresh-access',
      refresh_token: 'refresh-token',
    });
  });

  it('throws a reauth error when Calendar returns 401 without a refresh token', async () => {
    mockColorsGet.mockResolvedValue({
      data: {
        event: {},
      },
    });
    mockEventsList.mockRejectedValue({ response: { status: 401 } });
    const configService = {
      getOrThrow: jest.fn((key: string) => key),
    };
    const service = new GoogleService(configService as unknown as ConfigService);

    await expect(service.getTodayEvents('stale-access')).rejects.toEqual(
      expect.objectContaining({
        code: 'needs_reauth',
        provider: 'GOOGLE',
      }),
    );
  });
});
