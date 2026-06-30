import { EmailSyncService } from './email-sync.service';

describe('EmailSyncService', () => {
  const prisma = {
    emailAccount: {
      findMany: jest.fn(),
    },
  };

  const gmailAdapter = {
    supports: jest.fn(),
    fetchEmails: jest.fn(),
    fetchEvents: jest.fn(),
  };
  const microsoftAdapter = {
    supports: jest.fn(),
    fetchEmails: jest.fn(),
    fetchEvents: jest.fn(),
  };
  const imapAdapter = {
    supports: jest.fn(),
    fetchEmails: jest.fn(),
    fetchEvents: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createService() {
    return new EmailSyncService(
      prisma as any,
      gmailAdapter as any,
      microsoftAdapter as any,
      imapAdapter as any,
    );
  }

  it('syncs all accounts independently', async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: 'g1', provider: 'GOOGLE' },
      { id: 'm1', provider: 'MICROSOFT' },
    ]);

    gmailAdapter.supports.mockImplementation((account: { provider: string }) => account.provider === 'GOOGLE');
    microsoftAdapter.supports.mockImplementation((account: { provider: string }) => account.provider === 'MICROSOFT');
    imapAdapter.supports.mockReturnValue(false);

    gmailAdapter.fetchEmails.mockResolvedValue([{ id: 'ge1' }]);
    gmailAdapter.fetchEvents.mockResolvedValue([{ id: 'gc1' }]);
    microsoftAdapter.fetchEmails.mockResolvedValue([{ id: 'me1' }]);
    microsoftAdapter.fetchEvents.mockResolvedValue([{ id: 'mc1' }]);

    const service = createService();

    await expect(service.syncForUser('user-1')).resolves.toEqual([
      {
        account: { id: 'g1', provider: 'GOOGLE' },
        status: 'ready',
        emails: [{ id: 'ge1' }],
        events: [{ id: 'gc1' }],
      },
      {
        account: { id: 'm1', provider: 'MICROSOFT' },
        status: 'ready',
        emails: [{ id: 'me1' }],
        events: [{ id: 'mc1' }],
      },
    ]);
  });

  it('returns provider errors per account without failing global sync', async () => {
    prisma.emailAccount.findMany.mockResolvedValue([{ id: 'i1', provider: 'IMAP' }]);

    gmailAdapter.supports.mockReturnValue(false);
    microsoftAdapter.supports.mockReturnValue(false);
    imapAdapter.supports.mockReturnValue(true);
    imapAdapter.fetchEmails.mockRejectedValue(new Error('down'));
    imapAdapter.fetchEvents.mockResolvedValue([]);

    const service = createService();

    await expect(service.syncForUser('user-1')).resolves.toEqual([
      {
        account: { id: 'i1', provider: 'IMAP' },
        status: 'error',
        code: 'provider_unavailable',
        message: 'Les données IMAP sont temporairement indisponibles.',
        emails: [],
        events: [],
      },
    ]);
  });
});
