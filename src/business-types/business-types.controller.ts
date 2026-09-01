import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BusinessTypesService } from './business-types.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

// Gestión de tipos de negocio (plataforma): etiqueta + set de módulos por tipo.
@Controller('business-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_PLATFORM_ADMIN')
export class BusinessTypesController {
  constructor(private readonly service: BusinessTypesService) {}

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user);
  }

  @Post()
  create(@Body() dto: any, @Req() req) {
    return this.service.create(req.user, dto);
  }

  @Patch(':type')
  update(@Param('type') type: string, @Body() dto: any, @Req() req) {
    return this.service.update(req.user, type, dto);
  }
}
