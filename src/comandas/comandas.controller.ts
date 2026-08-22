import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ComandasService } from './comandas.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('comandas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComandasController {
  constructor(private readonly service: ComandasService) {}

  // Vista de cocina (antes de :id)
  @Get('kitchen')
  kitchen(@Req() req) {
    return this.service.kitchen(req.user);
  }

  @Get('mesa/:mesaId')
  byMesa(@Param('mesaId', ParseIntPipe) mesaId: number, @Req() req) {
    return this.service.byMesa(mesaId, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'CAJA', 'MESERO')
  @Post()
  create(@Body() dto: any, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'CAJA', 'MESERO')
  @Post(':id/items')
  addItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { items: any[] },
    @Req() req,
  ) {
    return this.service.addItems(id, body?.items || [], req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'CAJA', 'MESERO', 'COCINERO')
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
    @Req() req,
  ) {
    return this.service.setStatus(id, status, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'CAJA')
  @Post(':id/charge')
  charge(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req) {
    return this.service.charge(id, dto, req.user);
  }

  // Cobrar toda la mesa (todas sus comandas abiertas en una sola venta).
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR', 'CAJA')
  @Post('mesa/:mesaId/charge')
  chargeMesa(
    @Param('mesaId', ParseIntPipe) mesaId: number,
    @Body() dto: any,
    @Req() req,
  ) {
    return this.service.chargeMesa(mesaId, dto, req.user);
  }
}
