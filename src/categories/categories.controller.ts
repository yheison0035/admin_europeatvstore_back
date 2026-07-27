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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ADMIN / COORDINADOR / SUPER_ADMIN / ASESOR
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'COORDINADOR', 'ASESOR')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.categoriesService.findAllPaginated(req.user, query);
  }

  // Obtener una categoría
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'COORDINADOR', 'ASESOR')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.categoriesService.findOne(id, req.user);
  }

  // Crear categoría
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Post()
  create(@Body() dto: CreateCategoryDto, @Req() req) {
    return this.categoriesService.create(dto, req.user);
  }

  // Actualizar categoría
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @Req() req,
  ) {
    return this.categoriesService.update(id, dto, req.user);
  }

  // Eliminar categoría (soft delete)
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.categoriesService.remove(id, req.user);
  }
}
