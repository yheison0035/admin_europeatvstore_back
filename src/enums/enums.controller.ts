import { Controller, Get, UseGuards } from '@nestjs/common';
import { EnumsService } from './enums.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('enums')
@UseGuards(JwtAuthGuard)
export class EnumsController {
  constructor(private readonly enumsService: EnumsService) {}

  @Get('roles')
  getRoles() {
    return { success: true, data: this.enumsService.getRoles() };
  }

  @Get('status')
  getStatus() {
    return { success: true, data: this.enumsService.getStatus() };
  }

  @Get('payment-methods')
  getPaymentMethods() {
    return { success: true, data: this.enumsService.getPaymentMethods() };
  }

  @Get('payment-status')
  getPaymentStatus() {
    return { success: true, data: this.enumsService.getPaymentStatus() };
  }

  @Get('sale-status')
  getSaleStatus() {
    return { success: true, data: this.enumsService.getSaleStatus() };
  }

  @Get('type-expenses')
  getTypeExpenses() {
    return { success: true, data: this.enumsService.getTypeExpenses() };
  }
}
