import {
  Body,
  Controller,
  Get,
  Patch,
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
