import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: SettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SettingsService(prisma as never);
  });

  it('returns the normalized theme with parsed settings', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      theme: 'zen',
      aiSummaryInstructions: 'Focus on deadlines',
      excludedSenders: '["newsletter@example.com"]',
    });

    await expect(service.getSettings('user-1')).resolves.toEqual({
      theme: 'zen',
      aiSummaryInstructions: 'Focus on deadlines',
      excludedSenders: ['newsletter@example.com'],
    });
  });

  it('falls back to light for unsupported themes on read', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      theme: 'midnight',
      aiSummaryInstructions: null,
      excludedSenders: '[]',
    });

    await expect(service.getSettings('user-1')).resolves.toEqual({
      theme: 'light',
      aiSummaryInstructions: null,
      excludedSenders: [],
    });
  });

  it('normalizes and persists supported theme updates', async () => {
    prisma.user.update.mockResolvedValue({
      theme: 'dark',
      aiSummaryInstructions: null,
      excludedSenders: '["alerts@example.com"]',
    });

    await expect(
      service.updateSettings('user-1', {
        theme: 'dark',
        excludedSenders: ['alerts@example.com'],
      }),
    ).resolves.toEqual({
      theme: 'dark',
      aiSummaryInstructions: null,
      excludedSenders: ['alerts@example.com'],
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          theme: 'dark',
          excludedSenders: '["alerts@example.com"]',
        }),
      }),
    );
  });

  it('stores light when an unsupported theme is submitted', async () => {
    prisma.user.update.mockResolvedValue({
      theme: 'light',
      aiSummaryInstructions: null,
      excludedSenders: '[]',
    });

    await service.updateSettings('user-1', { theme: 'midnight' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          theme: 'light',
        }),
      }),
    );
  });
});
