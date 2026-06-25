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
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
    expect(result).toEqual({
      summary: 'Today looks busy.',
      events,
      suggested_tasks: [],
    });
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
    });
  });
});
