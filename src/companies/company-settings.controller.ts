import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

// Configuración self-service de la propia empresa (para el dueño/admin), aparte
// del controlador de plataforma que solo usa el SUPER_PLATFORM_ADMIN.
@Controller('company')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanySettingsController {
  constructor(private readonly service: CompaniesService) {}

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('settings')
  getSettings(@Req() req) {
    return this.service.getOwnSettings(req.user);
  }

  // Sin @Roles: cualquier usuario autenticado (incluida la caja/cajero) puede
  // leer la config fiscal mínima que el POS necesita para calcular el IVA.
  @Get('fiscal-config')
  getFiscalConfig(@Req() req) {
    return this.service.getFiscalConfig(req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('loyalty')
  updateLoyalty(
    @Body()
    dto: {
      loyaltyEnabled?: boolean;
      loyaltyStampsRequired?: number;
      loyaltyReward?: string;
    },
    @Req() req,
  ) {
    return this.service.updateLoyalty(req.user, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('loyalty/sync')
  syncLoyalty(@Req() req) {
    return this.service.syncLoyaltyFromSales(req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('theme')
  updateTheme(@Body('theme') theme: string, @Req() req) {
    return this.service.updateCrmTheme(req.user, theme);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('cash-policy')
  updateCashPolicy(@Body('requireCashOpen') requireCashOpen: boolean, @Req() req) {
    return this.service.updateCashPolicy(req.user, requireCashOpen);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('fiscal')
  updateFiscal(@Body() dto: any, @Req() req) {
    return this.service.updateFiscal(req.user, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('profile')
  updateProfile(
    @Body()
    dto: { name?: string; logo?: string; phone?: string; email?: string },
    @Req() req,
  ) {
    return this.service.updateProfile(req.user, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('hours')
  updateHours(
    @Body() dto: { openHour?: number; closeHour?: number },
    @Req() req,
  ) {
    return this.service.updateHours(req.user, dto);
  }
}
