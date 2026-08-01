import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Post('checkout')
  checkout(@Req() req, @Body('plan') plan: string) {
    return this.service.startCheckout(req.user, plan);
  }
}
