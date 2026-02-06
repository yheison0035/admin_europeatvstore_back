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
  Query,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { CreateExpenseDto } from './dto/create-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expenses.dto';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  /**
   * Obtener todos los gastos
   * SUPER_ADMIN / ADMIN / COORDINADOR / ASESOR
   */
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'ASESOR')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.expensesService.findAllPaginated(req.user, query);
  }

  /**
   * Obtener un gasto por ID
   * SUPER_ADMIN / ADMIN / COORDINADOR
   */
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.expensesService.findOne(id, req.user);
  }

  /**
   * Crear gasto
   * SUPER_ADMIN / ADMIN
   */
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateExpenseDto, @Req() req) {
    return this.expensesService.create(dto, req.user);
  }

  /**
   * Actualizar gasto
   * SUPER_ADMIN / ADMIN
   */
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
    @Req() req,
  ) {
    return this.expensesService.update(id, dto, req.user);
  }

  /**
   * Eliminar gasto (soft delete)
   * SOLO SUPER_ADMIN
   */
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.expensesService.remove(id, req.user);
  }
}
