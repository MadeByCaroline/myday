import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;
  private readonly frontendUrl: string;
  private readonly priceIds: Record<'monthly' | 'annual', string>;
  private readonly webhookSecret: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
    this.frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    this.priceIds = {
      monthly: this.configService.getOrThrow<string>('STRIPE_MONTHLY_PRICE_ID'),
      annual: this.configService.getOrThrow<string>('STRIPE_ANNUAL_PRICE_ID'),
    };
    this.webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
  }

  async createCheckoutSession(
    userId: string,
    planType: 'monthly' | 'annual',
  ): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: this.priceIds[planType],
          quantity: 1,
        },
      ],
      client_reference_id: userId,
      success_url: `${this.frontendUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/pricing`,
    });

    if (!session.url) {
      this.logger.error(
        `Stripe checkout session created without a URL for user ${userId} with plan ${planType}`,
      );
      throw new Error(
        `Failed to create Stripe checkout session URL for user ${userId} with plan ${planType}`,
      );
    }

    return session.url;
  }

  async handleWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook signature verification failed: ${message}`);
      throw new BadRequestException(
        `Webhook signature verification failed: ${message}`,
      );
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;

      if (!userId) {
        this.logger.warn(
          'checkout.session.completed received without client_reference_id',
        );
        return;
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: { isPremium: true },
      });

      this.logger.log(`User ${userId} upgraded to Premium via Stripe webhook`);
    }
  }
}
