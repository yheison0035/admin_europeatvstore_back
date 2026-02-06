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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ADMIN / COORDINADOR / SUPER_ADMIN / ASESOR
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'ASESOR')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.categoriesService.findAllPaginated(req.user, query);
  }

  // Obtener una categoría
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.categoriesService.findOne(id, req.user);
  }

  // Crear categoría
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateCategoryDto, @Req() req) {
    return this.categoriesService.create(dto, req.user);
  }

  // Actualizar categoría
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @Req() req,
  ) {
    return this.categoriesService.update(id, dto, req.user);
  }

  // Eliminar categoría (soft delete)
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.categoriesService.remove(id, req.user);
  }
}
