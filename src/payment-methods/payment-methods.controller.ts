import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { PaymentMethodsService } from './payment-methods.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  // Leer: dueño/admin y los roles que venden/registran pagos (para los selects).
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'RECEPCIONISTA',
    'ASESOR',
    'CAJA',
    'VENTAS',
    'MESERO',
  )
  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Req() req, @Body() dto: any) {
    return this.service.create(req.user, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(req.user, id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user, id);
  }
}
