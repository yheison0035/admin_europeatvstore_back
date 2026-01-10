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
import { LocalsService } from './locals.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('locals')
@UseGuards(JwtAuthGuard)
export class LocalsController {
  constructor(private readonly localsService: LocalsService) {}

  // ADMIN / COORDINADOR / SUPER_ADMIN
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Get()
  findAll(@Req() req) {
    return this.localsService.findAll(req.user);
  }

  // ADMIN ve cualquiera, ASESOR solo si es responsable
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.localsService.findOne(id, req.user);
  }

  // Crear local (ADMIN / SUPER_ADMIN)
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateLocalDto, @Req() req) {
    return this.localsService.create(dto, req.user);
  }

  // Actualizar local
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocalDto,
    @Req() req,
  ) {
    return this.localsService.update(id, dto, req.user);
  }

  // Eliminar local
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.localsService.remove(id, req.user);
  }
}
