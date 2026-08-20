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
  Patch,
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

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.salesService.findAllPaginated(req.user, query);
  }

  // Clientes por reactivar (sin volver hace 10-15 días por defecto). Debe ir
  // antes de :id para no interpretarse como un id.
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Get('inactive-customers')
  inactiveCustomers(@Req() req, @Query() query) {
    const minDays = Number(query.minDays) || 20;
    const maxDays = query.maxDays ? Number(query.maxDays) : undefined;
    return this.salesService.getInactiveCustomers(req.user, minDays, maxDays);
  }

  // Marca que ya se le escribió al cliente para reactivarlo.
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Patch('inactive-customers/:id/contacted')
  markContacted(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.salesService.markWinbackContacted(id, req.user);
  }

  // ---- PEDIDOS (ventas de la tienda online). Van antes de :id ----
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'VENTAS', 'CAJA')
  @Get('orders/list')
  findOrders(@Req() req, @Query() query) {
    return this.salesService.findOrders(req.user, query);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'VENTAS', 'CAJA')
  @Get('orders/:id')
  findOrderOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.salesService.findOrderOne(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'VENTAS', 'CAJA')
  @Patch('orders/:id/fulfillment')
  updateOrderFulfillment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Req() req,
  ) {
    return this.salesService.updateOrderFulfillment(id, req.user, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.salesService.findOne(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Post()
  create(@Body() dto: CreateSaleDto, @Req() req) {
    return this.salesService.create(dto, req.user);
  }

  // El RECEPCIONISTA puede crear ventas (Realizar Factura) pero NO editar las
  // ventas ya realizadas.
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

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Post('reports/daily')
  dailyReport(@Body() dto: DailySalesReportDto, @Req() req) {
    return this.salesService.dailySalesReport(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Post('reports/range')
  rangeReport(@Body() dto: RangeSalesReportDto, @Req() req) {
    return this.salesService.rangeSalesReport(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Post('reports/range/general')
  rangeGeneralReport(@Body() dto: any, @Req() req) {
    return this.salesService.rangeSalesGeneralReport(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Post('reports/service-performance')
  servicePerformanceReport(@Body() dto: any, @Req() req) {
    return this.salesService.servicePerformanceReport(dto, req.user);
  }
}
