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
});
