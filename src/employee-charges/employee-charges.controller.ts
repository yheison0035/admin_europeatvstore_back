import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmployeeChargesService } from './employee-charges.service';
import { CreateEmployeeChargeDto } from './dto/create-employee-charge.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('employee-charges')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeChargesController {
  constructor(private readonly service: EmployeeChargesService) {}

  // Lectura: el dueño ve todos; el empleado solo los suyos (scoping en service).
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.service.findAll(req.user, query);
  }

  @Get('summary')
  summary(@Req() req, @Query() query) {
    return this.service.summary(req.user, query);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateEmployeeChargeDto, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/settle')
  settle(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req) {
    return this.service.settle(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/unsettle')
  unsettle(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.unsettle(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req) {
    return this.service.update(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
