import { ChatController } from './chat.controller';

describe('ChatController', () => {
  it('delegates messages to ChatService using authenticated user id', async () => {
    const chatService = {
      sendMessage: jest.fn().mockResolvedValue({ message: 'Hello' }),
    };
    const controller = new ChatController(chatService as any);

    const result = await controller.sendMessage(
      { user: { id: 'user-1' } },
      { prompt: 'How busy am I?' },
    );

    expect(chatService.sendMessage).toHaveBeenCalledWith(
      'user-1',
      'How busy am I?',
    );
    expect(result).toEqual({ message: 'Hello' });
  });
});
