import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Req,
  Put,
  Query,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Public } from '@/auth/decorators/public.decorator';
import { DailySalesReportDto } from './dto/reports/daily/daily-sales-report.dto';
import { RangeSalesReportDto } from './dto/reports/range/range-sales-report.dto';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.salesService.findAllPaginated(req.user, query);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.salesService.findOne(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Post()
  create(@Body() dto: CreateSaleDto, @Req() req) {
    return this.salesService.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaleDto,
    @Req() req,
  ) {
    return this.salesService.update(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.salesService.remove(id, req.user);
  }

  @Get('verify/:code')
  @Public()
  async verify(@Param('code') code: string) {
    return this.salesService.verifySale(code);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Post('reports/daily')
  dailyReport(@Body() dto: DailySalesReportDto, @Req() req) {
    return this.salesService.dailySalesReport(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Post('reports/range')
  rangeReport(@Body() dto: RangeSalesReportDto, @Req() req) {
    return this.salesService.rangeSalesReport(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Post('reports/range/general')
  rangeGeneralReport(@Body() dto: any, @Req() req) {
    return this.salesService.rangeSalesGeneralReport(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Post('reports/service-performance')
  servicePerformanceReport(@Body() dto: any, @Req() req) {
    return this.salesService.servicePerformanceReport(dto, req.user);
  }
}
