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
import { ExpenseCategoriesService } from './expense-categories.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly service: ExpenseCategoriesService) {}

  // Leer: también los roles que registran gastos (para el select del formulario).
  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR', 'RECEPCIONISTA', 'COORDINADOR')
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
