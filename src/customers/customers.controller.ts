import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  Req,
  UseGuards,
  Put,
  Patch,
  Query,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Ver clientes
  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'VENTAS',
    'BODEGUERO',
  )
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.customersService.findAllPaginated(req.user, query);
  }

  // Autocompletar por documento: trae el cliente si ya existe en la empresa.
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'VENTAS',
    'BODEGUERO',
  )
  @Get('lookup')
  lookup(@Query('document') document: string, @Req() req) {
    return this.customersService.findByDocument(document, req.user);
  }

  // Ficha 360° del cliente (métricas, historial, segmento). Antes de :id.
  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'VENTAS',
    'BODEGUERO',
  )
  @Get(':id/summary')
  summary(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.customersService.getCustomerSummary(id, req.user);
  }

  // Ver uno
  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'VENTAS',
    'BODEGUERO',
  )
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.customersService.findOne(id, req.user);
  }

  // Canjear un premio de fidelización
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Patch(':id/redeem-reward')
  redeemReward(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.customersService.redeemLoyaltyReward(id, req.user);
  }

  // Crear
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'COORDINADOR', 'ASESOR')
  @Post()
  create(@Body() dto: CreateCustomerDto, @Req() req) {
    return this.customersService.create(dto, req.user);
  }

  // Actualizar
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @Req() req,
  ) {
    return this.customersService.update(id, dto, req.user);
  }

  // Eliminar
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.customersService.remove(id, req.user);
  }
}
