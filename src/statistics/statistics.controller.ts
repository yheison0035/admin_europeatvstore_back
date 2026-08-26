import {
  Body,
  Controller,
  Get,
  Post,
  Query,
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

  // Reporte de IVA (generado vs descontable) de un periodo.
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('tax-report')
  taxReport(@Req() req, @Body() dto: { startDate?: string; endDate?: string }) {
    return this.statisticsService.getTaxReport(req.user, dto);
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

  // Serie de ventas para la gráfica del Home (ventas del NEGOCIO): NO para el
  // barbero (él solo ve lo suyo en "Mi rendimiento").
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'RECEPCIONISTA',
    'ASESOR',
    'AUXILIAR',
    'BODEGUERO',
    'VENTAS',
    'CAJA',
  )
  @Get('sales-trend')
  salesTrend(
    @Req() req,
    @Query('period') period?: string,
    @Query('offset') offset?: string,
  ) {
    return this.statisticsService.salesTrend(req.user, period, offset);
  }

  // "Mi rendimiento": SOLO lo del usuario que consulta. Cualquier empleado.
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'RECEPCIONISTA',
    'ASESOR',
    'AUXILIAR',
    'BODEGUERO',
    'VENTAS',
    'BARBERO',
    'CAJA',
    'MESERO',
    'COCINERO',
    'PROFESIONAL',
  )
  @Get('my-performance')
  myPerformance(@Req() req) {
    return this.statisticsService.myPerformance(req.user);
  }

  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'RECEPCIONISTA',
    'ASESOR',
    'AUXILIAR',
    'BODEGUERO',
    'VENTAS',
    'BARBERO',
    'CAJA',
    'MESERO',
    'COCINERO',
    'PROFESIONAL',
  )
  @Get('my-detail')
  myDetail(@Req() req, @Query('period') period?: string) {
    return this.statisticsService.myDetail(req.user, period);
  }

  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'RECEPCIONISTA',
    'ASESOR',
    'AUXILIAR',
    'BODEGUERO',
    'VENTAS',
    'BARBERO',
    'CAJA',
    'MESERO',
    'COCINERO',
    'PROFESIONAL',
  )
  @Get('my-history')
  myHistory(@Req() req, @Query('group') group?: string) {
    return this.statisticsService.myHistory(req.user, group);
  }
}
