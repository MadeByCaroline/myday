import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiService } from './ai.service';

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

describe('AiService', () => {
  const getOrThrowMock = jest.fn().mockReturnValue('test-gemini-key');
  const configService = {
    getOrThrow: getOrThrowMock,
  } as unknown as ConfigService;

  const emails = [
    {
      id: 'mail-1',
      from: 'alice@example.com',
      subject: 'Need follow-up',
      snippet: 'Can you send the notes?',
      receivedAt: '2026-06-25T09:00:00.000Z',
    },
  ];
  const events = [
    {
      id: 'evt-1',
      title: 'Daily sync',
      start: '2026-06-25T10:00:00.000Z',
      end: '2026-06-25T10:30:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Gemini JSON mode and fills missing fields from existing inputs', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({ summary: 'Today looks busy.' }),
      },
    });

    const service = new AiService(configService);
    const result = await service.analyzeProductivityData(emails, events);

    expect(getOrThrowMock).toHaveBeenCalledWith('GEMINI_API_KEY');
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
    expect(result).toEqual({
      summary: 'Today looks busy.',
      events,
      suggested_tasks: [],
      email_summaries: [
        {
          emailId: 'mail-1',
          summary: 'Can you send the notes?',
          category: 'INFO',
          suggestedActions: [
            'Répondre poliment',
            'Demander plus de détails',
            'Proposer un suivi rapide',
          ],
        },
      ],
    });
  });

  it('parses categorized email summaries when AI returns them as a JSON string', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            summary: 'Voici votre journée.',
            events,
            suggested_tasks: [],
            email_summaries:
              '[{"emailId":"mail-1","summary":"Demande d\\u2019envoyer un compte rendu","category":"ACTION_REQUIRED"},{"emailId":"mail-2","summary":"Mise \\u00e0 jour hebdomadaire","category":"newsletter"},{"emailId":"mail-3","summary":"Notification d\\u2019information","category":"UNKNOWN"}]',
          }),
      },
    });

    const service = new AiService(configService);
    const result = await service.analyzeProductivityData(emails, events);

    expect(result.email_summaries).toEqual([
      {
        emailId: 'mail-1',
        summary: 'Demande d’envoyer un compte rendu',
        category: 'ACTION_REQUIRED',
        suggestedActions: [
          'Répondre poliment',
          'Demander plus de détails',
          'Proposer un suivi rapide',
        ],
      },
      {
        emailId: 'mail-2',
        summary: 'Mise à jour hebdomadaire',
        category: 'NEWSLETTER',
        suggestedActions: [
          'Répondre poliment',
          'Demander plus de détails',
          'Proposer un suivi rapide',
        ],
      },
      {
        emailId: 'mail-3',
        summary: 'Notification d’information',
        category: 'INFO',
        suggestedActions: [
          'Répondre poliment',
          'Demander plus de détails',
          'Proposer un suivi rapide',
        ],
      },
    ]);
  });

  it('keeps three suggested actions returned by Gemini for each email summary', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            summary: 'Résumé du jour.',
            events,
            suggested_tasks: [],
            email_summaries: [
              {
                emailId: 'mail-1',
                summary: 'Besoin de revenir vers Alice',
                category: 'ACTION_REQUIRED',
                suggestedActions: [
                  'Accepter pour mardi',
                  'Proposer demain matin',
                  'Décliner poliment',
                ],
              },
            ],
          }),
      },
    });

    const service = new AiService(configService);
    const result = await service.analyzeProductivityData(emails, events);

    expect(result.email_summaries[0]?.suggestedActions).toEqual([
      'Accepter pour mardi',
      'Proposer demain matin',
      'Décliner poliment',
    ]);
  });

  it('returns a safe fallback when Gemini fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));

    const service = new AiService(configService);
    const result = await service.analyzeProductivityData(emails, events);

    expect(result).toEqual({
      summary:
        'Unable to generate AI summary at this time. Please check your Gemini configuration.',
      events,
      suggested_tasks: [],
      email_summaries: [
        {
          emailId: 'mail-1',
          summary: 'Can you send the notes?',
          category: 'INFO',
          suggestedActions: [
            'Répondre poliment',
            'Demander plus de détails',
            'Proposer un suivi rapide',
          ],
        },
      ],
    });
  });

  describe('generateTimeBlocking', () => {
    const tasks = [
      { id: 'task-1', title: 'Write report', description: 'Q2 report' },
      { id: 'task-2', title: 'Review PR', description: null },
    ];
    const calendarEvents = [
      {
        id: 'evt-1',
        title: 'Standup',
        start: '2026-06-26T09:00:00.000Z',
        end: '2026-06-26T09:15:00.000Z',
      },
    ];

    it('returns parsed time blocks from Gemini', async () => {
      const aiBlocks = [
        { taskId: 'task-1', suggestedStartTime: '09:30', suggestedEndTime: '10:00', title: 'Write report' },
        { taskId: 'task-2', suggestedStartTime: '10:00', suggestedEndTime: '10:30', title: 'Review PR' },
      ];
      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(aiBlocks) },
      });

      const service = new AiService(configService);
      const result = await service.generateTimeBlocking(tasks, calendarEvents);

      expect(result).toEqual(aiBlocks);
    });

    it('filters out malformed entries from the AI response', async () => {
      const aiResponse = [
        { taskId: 'task-1', suggestedStartTime: '09:30', suggestedEndTime: '10:00', title: 'Write report' },
        { taskId: 'task-2' },
      ];
      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(aiResponse) },
      });

      const service = new AiService(configService);
      const result = await service.generateTimeBlocking(tasks, calendarEvents);

      expect(result).toEqual([aiResponse[0]]);
    });

    it('returns fallback time blocks when Gemini returns a non-array', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify({ error: 'bad response' }) },
      });

      const service = new AiService(configService);
      const result = await service.generateTimeBlocking(tasks, calendarEvents);

      expect(result).toHaveLength(2);
      expect(result[0].taskId).toBe('task-1');
      expect(result[0].suggestedStartTime).toBe('09:00');
      expect(result[1].taskId).toBe('task-2');
    });

    it('returns fallback time blocks when Gemini throws', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API error'));

      const service = new AiService(configService);
      const result = await service.generateTimeBlocking(tasks, calendarEvents);

      expect(result).toHaveLength(2);
      expect(result[0].taskId).toBe('task-1');
      expect(result[1].taskId).toBe('task-2');
    });
  });
});
