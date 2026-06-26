import axios from 'axios';
import { MicrosoftService } from './microsoft.service';

describe('MicrosoftService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps unread Outlook emails to EmailSummary', async () => {
    const getSpy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        value: [
          {
            id: 'message-1',
            from: { emailAddress: { address: 'sender@example.com' } },
            subject: 'Quarterly update',
            bodyPreview: 'Please review the attached report.',
            receivedDateTime: '2026-06-25T12:00:00Z',
          },
        ],
      },
    });

    const service = new MicrosoftService();

    await expect(service.getUnreadEmails('access-token')).resolves.toEqual([
      {
        id: 'message-1',
        from: 'sender@example.com',
        subject: 'Quarterly update',
        snippet: 'Please review the attached report.',
        receivedAt: '2026-06-25T12:00:00Z',
      },
    ]);
    expect(getSpy).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages',
      {
        headers: {
          Authorization: 'Bearer ' + 'access-token',
        },
        params: {
          $filter: 'isRead eq false',
          $top: 15,
        },
      },
    );
  });

  it('maps today Outlook calendar events to UnifiedEvent', async () => {
    const getSpy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        value: [
          {
            id: 'event-1',
            subject: 'Planning sync',
            start: { dateTime: '2026-06-26T10:00:00Z' },
            end: { dateTime: '2026-06-26T10:30:00Z' },
            location: { displayName: 'Teams Room' },
            onlineMeeting: {
              joinUrl: 'https://teams.microsoft.com/l/meetup-join/test',
            },
          },
        ],
      },
    });

    const service = new MicrosoftService();

    await expect(service.getTodayEvents('access-token')).resolves.toEqual([
      {
        id: 'event-1',
        title: 'Planning sync',
        start: '2026-06-26T10:00:00Z',
        end: '2026-06-26T10:30:00Z',
        provider: 'MICROSOFT',
        location: 'Teams Room',
        link: 'https://teams.microsoft.com/l/meetup-join/test',
      },
    ]);
    const [, requestConfig] = getSpy.mock.calls[0] as [
      string,
      {
        headers: Record<string, string>;
        params: {
          $top: number;
          $orderby: string;
        };
      },
    ];
    expect(requestConfig.headers.Authorization).toBe(
      'Bearer ' + 'access-token',
    );
    expect(requestConfig.params).toMatchObject({
      $top: 50,
      $orderby: 'start/dateTime',
    });
  });

  it('creates an Outlook busy event for deep work sessions', async () => {
    const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        id: 'event-42',
      },
    });

    const service = new MicrosoftService();

    await expect(
      service.createBusyEvent(
        'access-token',
        new Date('2026-06-26T14:00:00.000Z'),
        new Date('2026-06-26T15:00:00.000Z'),
        'Busy until 3:00 PM',
      ),
    ).resolves.toBe('event-42');
    expect(postSpy).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events',
      {
        subject: 'Deep Work',
        body: {
          contentType: 'Text',
          content: 'Busy until 3:00 PM',
        },
        start: {
          dateTime: '2026-06-26T14:00:00.000Z',
          timeZone: 'UTC',
        },
        end: {
          dateTime: '2026-06-26T15:00:00.000Z',
          timeZone: 'UTC',
        },
        showAs: 'busy',
        isReminderOn: false,
      },
      {
        headers: {
          Authorization: 'Bearer ' + 'access-token',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('deletes an Outlook busy event when deep work stops', async () => {
    const deleteSpy = jest.spyOn(axios, 'delete').mockResolvedValue({
      data: {},
    });

    const service = new MicrosoftService();

    await service.deleteBusyEvent('access-token', 'event-42');

    expect(deleteSpy).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events/event-42',
      {
        headers: {
          Authorization: 'Bearer ' + 'access-token',
        },
      },
    );
  });
});
