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
import { MesasService } from './mesas.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('mesas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MesasController {
  constructor(private readonly service: MesasService) {}

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: any, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req) {
    return this.service.update(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
