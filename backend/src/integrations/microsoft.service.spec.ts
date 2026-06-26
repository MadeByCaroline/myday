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
            onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/test' },
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
    expect(getSpy).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/calendar/calendarView',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer ' + 'access-token',
        },
        params: expect.objectContaining({
          $top: 50,
          $orderby: 'start/dateTime',
        }),
      }),
    );
  });
});
