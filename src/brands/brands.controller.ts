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
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('brands')
@UseGuards(JwtAuthGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  // LISTAR
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  // VER UNO
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.findOne(id);
  }

  // CREAR
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateBrandDto, @Req() req) {
    return this.brandsService.create(dto, req.user);
  }

  // ACTUALIZAR
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBrandDto,
    @Req() req,
  ) {
    return this.brandsService.update(id, dto, req.user);
  }

  // ELIMINAR
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.brandsService.remove(id, req.user);
  }
}
