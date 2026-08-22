import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SuppliesService } from './supplies.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { CreateSupplyDto } from './dto/create-supply.dto';
import { UpdateSupplyDto } from './dto/update-supply.dto';
import { AdjustSupplyDto } from './dto/adjust-supply.dto';

@Controller('supplies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliesController {
  constructor(private readonly service: SuppliesService) {}

  @Get()
  findAll(@Req() req, @Query() query: any) {
    return this.service.findAll(req.user, query);
  }

  @Get(':id/movements')
  movements(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.movements(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateSupplyDto, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplyDto,
    @Req() req,
  ) {
    return this.service.update(id, dto, req.user);
  }

  // Entrada/salida/ajuste: además del dueño, la cocina/caja pueden registrar
  // consumo o reposición del día.
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'CAJA', 'COCINERO')
  @Post(':id/adjust')
  adjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustSupplyDto,
    @Req() req,
  ) {
    return this.service.adjust(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
