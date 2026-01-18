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
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Ver clientes
  @UseGuards(RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'VENTAS',
    'BODEGUERO',
  )
  @Get()
  findAll(@Req() req) {
    return this.customersService.findAll(req.user);
  }

  // Ver uno
  @UseGuards(RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
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

  // Crear
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'ASESOR')
  @Post()
  create(@Body() dto: CreateCustomerDto, @Req() req) {
    return this.customersService.create(dto, req.user);
  }

  // Actualizar
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @Req() req,
  ) {
    return this.customersService.update(id, dto, req.user);
  }

  // Eliminar
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.customersService.remove(id, req.user);
  }
}
