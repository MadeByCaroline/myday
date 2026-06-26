import { AiController } from './ai.controller';

describe('AiController', () => {
  it('delegates morning briefing generation to ai service', async () => {
    const briefing = { greeting: 'Hi' };
    const aiService = {
      generateMorningBriefing: jest.fn().mockResolvedValue(briefing),
    };
    const controller = new AiController(aiService as any);

    await expect(
      controller.getMorningBriefing({ user: { id: 'user-1' } }),
    ).resolves.toEqual(briefing);

    expect(aiService.generateMorningBriefing).toHaveBeenCalledWith('user-1');
  });
});
