import { EmailsController } from './emails.controller';

describe('EmailsController', () => {
  it('delegates draft creation with the selected action string', async () => {
    const emailsService = {
      createDraft: jest
        .fn()
        .mockResolvedValue({ draftId: 'draft-1', provider: 'GOOGLE' }),
    };
    const controller = new EmailsController(emailsService as any);

    await expect(
      controller.createDraft({ user: { id: 'user-1' } }, 'message-1', {
        action: 'Accepter pour mardi',
      }),
    ).resolves.toEqual({ draftId: 'draft-1', provider: 'GOOGLE' });

    expect(emailsService.createDraft).toHaveBeenCalledWith(
      'user-1',
      'message-1',
      'Accepter pour mardi',
    );
  });
});
