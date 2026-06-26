import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCheckoutSessionDto } from './create-checkout-session.dto';
import { PaymentsService } from './payments.service';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
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
}
