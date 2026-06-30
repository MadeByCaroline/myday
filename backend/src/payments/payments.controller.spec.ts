import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  const mockPaymentsService = {
    createCheckoutSession: jest.fn(),
    handleWebhookEvent: jest.fn(),
  };

  const controller = new PaymentsController(mockPaymentsService as any);

  it('returns isPremium: true for a premium user', () => {
    const req = { user: { id: 'user-1', isPremium: true } } as any;
    expect(controller.getSubscriptionStatus(req)).toEqual({ isPremium: true });
  });

  it('returns isPremium: false for a non-premium user', () => {
    const req = { user: { id: 'user-2', isPremium: false } } as any;
    expect(controller.getSubscriptionStatus(req)).toEqual({ isPremium: false });
  });
});
