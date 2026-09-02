import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { PlatformPlansService } from './platform-plans.service';

// Configuración de planes — solo SUPER_PLATFORM_ADMIN.
@Controller('platform/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_PLATFORM_ADMIN')
export class PlatformPlansController {
  constructor(private readonly service: PlatformPlansService) {}

  @Get()
  getConfig() {
    return this.service.getConfig();
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.createPlan(dto);
  }

  // Actualiza el mapa de gating (módulo -> plan). Va antes de :id.
  @Put('gates')
  setGates(@Body() body: { gates: Record<string, string> }) {
    return this.service.setGates(body?.gates || {});
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.updatePlan(id, dto);
  }
}
