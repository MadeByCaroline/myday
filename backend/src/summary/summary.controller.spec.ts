import { SummaryController } from './summary.controller';

describe('SummaryController', () => {
  it('delegates summary generation to the shared summary service', async () => {
    const summaryService = {
      generateSummaryForUser: jest.fn().mockResolvedValue({ summary: 'ok' }),
    };
    const controller = new SummaryController(summaryService as any);

    await controller.generateSummary({ user: { id: 'user-1' } });

    expect(summaryService.generateSummaryForUser).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('returns the shared service result when no OAuth accounts are connected', async () => {
    const controller = new SummaryController({
      generateSummaryForUser: jest.fn().mockResolvedValue({
        error:
          'No OAuth token found. Please connect a Google or Outlook account.',
      }),
    } as any);

    await expect(
      controller.generateSummary({ user: { id: 'user-1' } }),
    ).resolves.toEqual({
      error:
        'No OAuth token found. Please connect a Google or Outlook account.',
    });
  });
});
