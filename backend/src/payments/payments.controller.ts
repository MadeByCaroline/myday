import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCheckoutSessionDto } from './create-checkout-session.dto';
import { PaymentsService } from './payments.service';

interface AuthenticatedRequest extends RawBodyRequest<Request> {
  user: {
    id: string;
    isPremium: boolean;
  };
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('subscription/status')
  @UseGuards(JwtAuthGuard)
  getSubscriptionStatus(@Req() req: AuthenticatedRequest): {
    isPremium: boolean;
  } {
    return { isPremium: req.user.isPremium };
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateCheckoutSessionDto,
  ): Promise<{ url: string }> {
    const url = await this.paymentsService.createCheckoutSession(
      req.user.id,
      body.planType,
    );
    return { url };
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<void> {
    if (!req.rawBody) {
      throw new BadRequestException('Missing request body');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    await this.paymentsService.handleWebhookEvent(req.rawBody, signature);
  }
}
