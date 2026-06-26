import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';

const mockSessionCreate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockSessionCreate,
      },
    },
  }));
});

describe('PaymentsService', () => {
  const configValues: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_mock',
    FRONTEND_URL: 'http://localhost:5173',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly_mock',
    STRIPE_ANNUAL_PRICE_ID: 'price_annual_mock',
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
    new PaymentsService(configService);
    expect(Stripe).toHaveBeenCalledWith('sk_test_mock');
  });

  it('creates a monthly checkout session and returns the URL', async () => {
    const mockUrl = 'https://checkout.stripe.com/pay/mock-session-monthly';
    mockSessionCreate.mockResolvedValue({ url: mockUrl });

    const service = new PaymentsService(configService);
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

    const service = new PaymentsService(configService);
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

    const service = new PaymentsService(configService);
    await expect(
      service.createCheckoutSession('user-3', 'monthly'),
    ).rejects.toThrow(
      'Failed to create Stripe checkout session URL for user user-3 with plan monthly',
    );
  });
});
