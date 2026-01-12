import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Put,
  Req,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @UseGuards(RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
  )
  @Get()
  findAll(@Req() req) {
    return this.inventoryService.findAll(req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
  )
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.inventoryService.findOne(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Post()
  create(@Body() dto: CreateInventoryDto, @Req() req) {
    return this.inventoryService.create(dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryDto,
    @Req() req,
  ) {
    return this.inventoryService.update(id, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.inventoryService.remove(id, req.user);
  }

  // Endpoint para sincronizar imágenes de un producto
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Put(':id/images')
  @UseInterceptors(FilesInterceptor('images', 10))
  syncImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('keepImageIds') keepImageIds: string[],
    @Req() req,
  ) {
    const ids = Array.isArray(keepImageIds) ? keepImageIds.map(Number) : [];

    return this.inventoryService.syncProductImages(id, files, ids, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
    'VENTAS',
  )
  @Get('search/:term')
  search(@Param('term') term: string, @Req() req) {
    return this.inventoryService.search(term, req.user);
  }
}
