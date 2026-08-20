import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { DashboardDto } from './dto/dashboard.dto';

@Controller('statistics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Post('dashboard')
  getDashboard(@Req() req, @Body() dto: DashboardDto) {
    return this.statisticsService.getDashboard(req.user, dto);
  }

  // Resumen del Home (para cualquier usuario del dashboard).
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'RECEPCIONISTA',
    'ASESOR',
    'AUXILIAR',
    'BODEGUERO',
    'VENTAS',
  )
  @Get('home')
  home(@Req() req) {
    return this.statisticsService.homeSummary(req.user);
  }
}
