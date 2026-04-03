import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  // LISTAR
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'ASESOR')
  @Get()
  findAll(@Query() query, @Req() req) {
    return this.providersService.findAllPaginated(query, req.user);
  }

  // VER UNO
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Get(':id')
  findOne(@Param('id') id: number, @Req() req) {
    return this.providersService.findOne(id, req.user);
  }

  // CREAR
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateProviderDto, @Req() req) {
    return this.providersService.create(dto, req.user);
  }

  // ACTUALIZAR
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProviderDto,
    @Req() req,
  ) {
    return this.providersService.update(id, dto, req.user);
  }

  // ELIMINAR
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.providersService.remove(id, req.user);
  }
}
