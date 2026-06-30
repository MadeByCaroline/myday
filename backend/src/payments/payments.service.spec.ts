import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';

const mockSessionCreate = jest.fn();
const mockConstructEvent = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockSessionCreate,
      },
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
});

const mockPrisma = {
  user: {
    update: mockUserUpdate,
  },
};

describe('PaymentsService', () => {
  const configValues: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_mock',
    FRONTEND_URL: 'http://localhost:5173',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly_mock',
    STRIPE_ANNUAL_PRICE_ID: 'price_annual_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_mock',
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getOrThrow as jest.Mock).mockImplementation(
      (key: string) => configValues[key],
    );
  });

  it('initialises Stripe with the secret key from config', () => {
    new PaymentsService(configService, mockPrisma as never);
    expect(Stripe).toHaveBeenCalledWith('sk_test_mock');
  });

  it('creates a monthly checkout session and returns the URL', async () => {
    const mockUrl = 'https://checkout.stripe.com/pay/mock-session-monthly';
    mockSessionCreate.mockResolvedValue({ url: mockUrl });

    const service = new PaymentsService(configService, mockPrisma as never);
    const url = await service.createCheckoutSession('user-1', 'monthly');

    expect(mockSessionCreate).toHaveBeenCalledWith({
      mode: 'subscription',
      line_items: [{ price: 'price_monthly_mock', quantity: 1 }],
      client_reference_id: 'user-1',
      success_url:
        'http://localhost:5173/dashboard?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:5173/pricing',
    });
    expect(url).toBe(mockUrl);
  });

  it('creates an annual checkout session and returns the URL', async () => {
    const mockUrl = 'https://checkout.stripe.com/pay/mock-session-annual';
    mockSessionCreate.mockResolvedValue({ url: mockUrl });

    const service = new PaymentsService(configService, mockPrisma as never);
    const url = await service.createCheckoutSession('user-2', 'annual');

    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_annual_mock', quantity: 1 }],
        client_reference_id: 'user-2',
      }),
    );
    expect(url).toBe(mockUrl);
  });

  it('throws when Stripe session returns no URL', async () => {
    mockSessionCreate.mockResolvedValue({ url: null });

    const service = new PaymentsService(configService, mockPrisma as never);
    await expect(
      service.createCheckoutSession('user-3', 'monthly'),
    ).rejects.toThrow(
      'Failed to create Stripe checkout session URL for user user-3 with plan monthly',
    );
  });

  describe('handleWebhookEvent', () => {
    const rawBody = Buffer.from('{"type":"checkout.session.completed"}');
    const signature = 't=123,v1=abc';

    it('throws BadRequestException when signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      const service = new PaymentsService(configService, mockPrisma as never);
      await expect(
        service.handleWebhookEvent(rawBody, signature),
      ).rejects.toThrow(BadRequestException);

      expect(mockConstructEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        'whsec_mock',
      );
    });

    it('sets isPremium to true for the user on checkout.session.completed', async () => {
      const event: Partial<Stripe.Event> = {
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'user-42',
          } as Stripe.Checkout.Session,
        },
      };
      mockConstructEvent.mockReturnValue(event);
      mockUserUpdate.mockResolvedValue({});

      const service = new PaymentsService(configService, mockPrisma as never);
      await service.handleWebhookEvent(rawBody, signature);

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-42' },
        data: { isPremium: true },
      });
    });

    it('does not update the user when client_reference_id is missing', async () => {
      const event: Partial<Stripe.Event> = {
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: null,
          } as Stripe.Checkout.Session,
        },
      };
      mockConstructEvent.mockReturnValue(event);

      const service = new PaymentsService(configService, mockPrisma as never);
      await service.handleWebhookEvent(rawBody, signature);

      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('ignores unrelated event types', async () => {
      const event: Partial<Stripe.Event> = {
        type: 'invoice.payment_succeeded',
        data: { object: {} as Stripe.Invoice },
      };
      mockConstructEvent.mockReturnValue(event);

      const service = new PaymentsService(configService, mockPrisma as never);
      await service.handleWebhookEvent(rawBody, signature);

      expect(mockUserUpdate).not.toHaveBeenCalled();
    });
  });
});
