import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';

import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Status } from '@prisma/client';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_PLATFORM_ADMIN')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Get()
  findAll(@Req() req, @Query() query) {
    return this.service.findAllPaginated(req.user, query);
  }

  // Resumen global de la plataforma (debe ir antes de :id)
  @Get('platform/overview')
  overview(@Req() req) {
    return this.service.platformOverview(req.user);
  }

  // Auditoría de accesos de soporte (impersonaciones). Antes de :id.
  @Get('platform/audit')
  audit(@Req() req, @Query() query) {
    return this.service.platformAudit(req.user, query);
  }

  // Vista 360° de una empresa (antes de :id).
  @Get('platform/:id/detail')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.companyDetail(req.user, id);
  }

  // Renovar/marcar pagado: extiende la fecha de pago +N días (default 30).
  @Patch('platform/:id/renew')
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body('days') days: number,
    @Req() req,
  ) {
    return this.service.renewCompany(req.user, id, days ? Number(days) : 30);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
    @Req() req,
  ) {
    return this.service.update(id, dto, req.user);
  }

  // Activar / desactivar empresa (suspensión por impago)
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: Status,
    @Req() req,
  ) {
    return this.service.setStatus(id, status, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
