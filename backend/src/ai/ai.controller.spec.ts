import { AiController } from './ai.controller';

describe('AiController', () => {
  it('delegates morning briefing generation to ai service', async () => {
    const aiService = {
      generateMorningBriefing: jest.fn().mockResolvedValue({ greeting: 'Hi' }),
    };
    const controller = new AiController(aiService as any);

    await controller.getMorningBriefing({ user: { id: 'user-1' } });

    expect(aiService.generateMorningBriefing).toHaveBeenCalledWith('user-1');
  });
});
