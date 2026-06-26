import { EmailsService } from './emails.service';

describe('EmailsService', () => {
  const usersService = {
    getOAuthTokens: jest.fn(),
  };
  const prisma = {
    oAuthToken: {
      update: jest.fn(),
    },
  };
  const mailService = {
    getEmailById: jest.fn(),
    createDraft: jest.fn(),
  };
  const calendarService = {
    getEventsForRange: jest.fn(),
  };
  const microsoftService = {
    getEventsForRange: jest.fn(),
    getEmailById: jest.fn(),
    createDraft: jest.fn(),
  };
  const aiService = {
    generateDraftReply: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createService() {
    return new EmailsService(
      usersService as any,
      prisma as any,
      mailService as any,
      calendarService as any,
      microsoftService as any,
      aiService as any,
      configService as any,
    );
  }

  it('creates a Gmail draft for a matching Google message', async () => {
    usersService.getOAuthTokens.mockResolvedValue([
      {
        id: 'google-token',
        provider: 'google',
        accessToken: 'google-access',
        refreshToken: 'google-refresh',
        expiresAt: null,
      },
    ]);
    calendarService.getEventsForRange.mockResolvedValue([
      {
        id: 'event-1',
        title: 'Tuesday sync',
        start: '2026-06-30T09:00:00.000Z',
        end: '2026-06-30T09:30:00.000Z',
      },
    ]);
    mailService.getEmailById.mockResolvedValue({
      id: 'message-1',
      from: 'Alice <alice@example.com>',
      subject: 'Meeting request',
      snippet: 'Can you do Tuesday?',
      receivedAt: '2026-06-26T10:00:00.000Z',
      body: 'Can you do Tuesday morning for a quick sync?',
    });
    aiService.generateDraftReply.mockResolvedValue(
      'Bonjour Alice,\n\nMardi me convient.\n',
    );
    mailService.createDraft.mockResolvedValue('draft-1');

    const service = createService();

    await expect(
      service.createDraft('user-1', 'message-1', 'Accepter pour mardi'),
    ).resolves.toEqual({
      draftId: 'draft-1',
      provider: 'GOOGLE',
    });

    expect(calendarService.getEventsForRange).toHaveBeenCalled();
    expect(mailService.getEmailById).toHaveBeenCalledWith(
      'message-1',
      'google-access',
      'google-refresh',
    );
    const [draftReplyArg] = aiService.generateDraftReply.mock.calls[0] as [
      {
        email: { subject: string };
        action: string;
        events: Array<{
          id: string;
          title: string;
          start: string;
          end: string;
        }>;
      },
    ];
    expect(draftReplyArg).toMatchObject({
      email: {
        subject: 'Meeting request',
      },
      action: 'Accepter pour mardi',
      events: [
        {
          id: 'event-1',
          title: 'Tuesday sync',
          start: '2026-06-30T09:00:00.000Z',
          end: '2026-06-30T09:30:00.000Z',
        },
      ],
    });
    expect(mailService.createDraft).toHaveBeenCalledWith(
      'google-access',
      'google-refresh',
      {
        to: 'alice@example.com',
        subject: 'Re: Meeting request',
        body: 'Bonjour Alice,\n\nMardi me convient.\n',
      },
    );
  });

  it('throws when the email is not found in connected accounts', async () => {
    usersService.getOAuthTokens.mockResolvedValue([
      {
        id: 'google-token',
        provider: 'google',
        accessToken: 'google-access',
        refreshToken: 'google-refresh',
        expiresAt: null,
      },
    ]);
    calendarService.getEventsForRange.mockResolvedValue([]);
    mailService.getEmailById.mockResolvedValue(null);

    const service = createService();

    await expect(
      service.createDraft('user-1', 'missing-message', 'Répondre poliment'),
    ).rejects.toThrow(
      'The requested email could not be found in the connected mailboxes.',
    );
  });

  it('treats a same-day named weekday as the next occurrence', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T08:00:00.000Z'));
    usersService.getOAuthTokens.mockResolvedValue([
      {
        id: 'google-token',
        provider: 'google',
        accessToken: 'google-access',
        refreshToken: 'google-refresh',
        expiresAt: null,
      },
    ]);
    calendarService.getEventsForRange.mockResolvedValue([]);
    mailService.getEmailById.mockResolvedValue(null);

    const service = createService();

    await expect(
      service.createDraft('user-1', 'missing-message', 'Proposer lundi'),
    ).rejects.toThrow(
      'The requested email could not be found in the connected mailboxes.',
    );

    const [, , startDate, endDate] = calendarService.getEventsForRange.mock
      .calls[0] as [string, string, Date, Date];
    expect(startDate.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-07-06T23:59:59.000Z');
  });
});
