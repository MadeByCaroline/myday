import { BadRequestException } from '@nestjs/common';
import { AiController } from './ai.controller';

describe('AiController', () => {
  it('delegates morning briefing generation to ai service', async () => {
    const briefing = { greeting: 'Hi' };
    const aiService = {
      generateMorningBriefing: jest.fn().mockResolvedValue(briefing),
      processMeetingNotes: jest.fn(),
      summarizeMeetingTranscript: jest.fn(),
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
        summarizeMeetingTranscript: jest.fn(),
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
        summarizeMeetingTranscript: jest.fn(),
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
        summarizeMeetingTranscript: jest.fn(),
      };
      const controller = new AiController(aiService as any);

      await expect(controller.generateContent({})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when notes exceeds 5000 characters', async () => {
      const aiService = {
        generateMorningBriefing: jest.fn(),
        processMeetingNotes: jest.fn(),
        summarizeMeetingTranscript: jest.fn(),
      };
      const controller = new AiController(aiService as any);
      const longNotes = 'a'.repeat(5001);

      await expect(
        controller.generateContent({ notes: longNotes }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('summarizeMeeting', () => {
      const summary = {
        actionItems: [
          {
            title: 'Envoyer le compte-rendu',
            dueDate: null,
            priority: 'MEDIUM',
          },
        ],
        decisionSummary: 'Lancement validé lundi prochain.',
      };

      it('delegates to summarizeMeetingTranscript with trimmed transcript', async () => {
        const aiService = {
          generateMorningBriefing: jest.fn(),
          processMeetingNotes: jest.fn(),
          summarizeMeetingTranscript: jest.fn().mockResolvedValue(summary),
        };
        const controller = new AiController(aiService as any);

        await expect(
          controller.summarizeMeeting({
            transcriptText:
              '  Discussion projet avec décisions et actions à suivre.  ',
          }),
        ).resolves.toEqual(summary);

        expect(aiService.summarizeMeetingTranscript).toHaveBeenCalledWith(
          'Discussion projet avec décisions et actions à suivre.',
        );
      });

      it('throws BadRequestException when transcript is too short', async () => {
        const aiService = {
          generateMorningBriefing: jest.fn(),
          processMeetingNotes: jest.fn(),
          summarizeMeetingTranscript: jest.fn(),
        };
        const controller = new AiController(aiService as any);

        await expect(
          controller.summarizeMeeting({ transcriptText: 'Trop court' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('throws BadRequestException when no action item is found', async () => {
        const aiService = {
          generateMorningBriefing: jest.fn(),
          processMeetingNotes: jest.fn(),
          summarizeMeetingTranscript: jest
            .fn()
            .mockResolvedValue({ actionItems: [], decisionSummary: '' }),
        };
        const controller = new AiController(aiService as any);

        await expect(
          controller.summarizeMeeting({
            transcriptText:
              'Cette transcription contient des échanges mais aucune action exploitable apparente.',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });
  });
});
