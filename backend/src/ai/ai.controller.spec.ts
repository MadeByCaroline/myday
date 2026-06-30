import { BadRequestException } from '@nestjs/common';
import { AiController } from './ai.controller';

describe('AiController', () => {
  it('delegates morning briefing generation to ai service', async () => {
    const briefing = { greeting: 'Hi' };
    const aiService = {
      generateMorningBriefing: jest.fn().mockResolvedValue(briefing),
      processMeetingNotes: jest.fn(),
    };
    const controller = new AiController(aiService as any);

    await expect(
      controller.getMorningBriefing({ user: { id: 'user-1' } }),
    ).resolves.toEqual(briefing);

    expect(aiService.generateMorningBriefing).toHaveBeenCalledWith('user-1');
  });

  describe('generateContent', () => {
    const result = { linkedin: 'post', email: 'mail', tasks: [] };

    it('delegates to processMeetingNotes with trimmed notes', async () => {
      const aiService = {
        generateMorningBriefing: jest.fn(),
        processMeetingNotes: jest.fn().mockResolvedValue(result),
      };
      const controller = new AiController(aiService as any);

      await expect(
        controller.generateContent({ notes: '  Meeting notes  ' }),
      ).resolves.toEqual(result);

      expect(aiService.processMeetingNotes).toHaveBeenCalledWith(
        'Meeting notes',
      );
    });

    it('throws BadRequestException when notes is empty', async () => {
      const aiService = {
        generateMorningBriefing: jest.fn(),
        processMeetingNotes: jest.fn(),
      };
      const controller = new AiController(aiService as any);

      await expect(
        controller.generateContent({ notes: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when notes is missing', async () => {
      const aiService = {
        generateMorningBriefing: jest.fn(),
        processMeetingNotes: jest.fn(),
      };
      const controller = new AiController(aiService as any);

      await expect(
        controller.generateContent({}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when notes exceeds 5000 characters', async () => {
      const aiService = {
        generateMorningBriefing: jest.fn(),
        processMeetingNotes: jest.fn(),
      };
      const controller = new AiController(aiService as any);
      const longNotes = 'a'.repeat(5001);

      await expect(
        controller.generateContent({ notes: longNotes }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
