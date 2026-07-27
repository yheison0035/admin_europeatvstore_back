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
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('brands')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  // LISTAR
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'COORDINADOR', 'ASESOR')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.brandsService.findAllPaginated(req.user, query);
  }

  // VER UNO
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'COORDINADOR', 'ASESOR')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.brandsService.findOne(id, req.user);
  }

  // CREAR
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Post()
  create(@Body() dto: CreateBrandDto, @Req() req) {
    return this.brandsService.create(dto, req.user);
  }

  // ACTUALIZAR
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBrandDto,
    @Req() req,
  ) {
    return this.brandsService.update(id, dto, req.user);
  }

  // ELIMINAR
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.brandsService.remove(id, req.user);
  }
}
