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
  Patch,
  Req,
  UseInterceptors,
  UploadedFiles,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
  )
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.inventoryService.findAllPaginated(req.user, query);
  }

  // Productos con stock bajo (para el dashboard/alertas). Antes de :id.
  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
  )
  @Get('low-stock')
  lowStock(@Req() req) {
    return this.inventoryService.getLowStock(req.user);
  }

  // Productos por vencer (droguería / perecederos). Antes de :id.
  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
  )
  @Get('expiring')
  expiring(@Req() req) {
    return this.inventoryService.getExpiring(req.user);
  }

  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
  )
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.inventoryService.findOne(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Post()
  create(@Body() dto: CreateInventoryDto, @Req() req) {
    return this.inventoryService.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryDto,
    @Req() req,
  ) {
    return this.inventoryService.update(id, dto, req.user);
  }

  // Reponer rápido stock (solo productos de una sola presentación).
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'BODEGUERO')
  @Patch(':id/restock')
  restock(
    @Param('id', ParseIntPipe) id: number,
    @Body('amount') amount: number,
    @Req() req,
  ) {
    return this.inventoryService.restock(id, amount, req.user);
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.inventoryService.remove(id, req.user);
  }

  // Endpoint para sincronizar imágenes de un producto
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Put(':id/images')
  @UseInterceptors(FilesInterceptor('images', 10))
  syncImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('keepImageIds') keepImageIds: string[],
    @Body('order') order: string[],
    @Req() req,
  ) {
    const ids = Array.isArray(keepImageIds)
      ? keepImageIds.map(Number)
      : keepImageIds
        ? [Number(keepImageIds)]
        : [];

    // El orden puede llegar como un solo string si hay un único elemento.
    const orderArr = Array.isArray(order) ? order : order ? [order] : [];

    return this.inventoryService.syncProductImages(
      id,
      files,
      ids,
      orderArr,
      req.user,
    );
  }

  @Roles(
    'SUPER_ADMIN',
    'ADMIN', 'RECEPCIONISTA',
    'COORDINADOR',
    'AUXILIAR',
    'ASESOR',
    'BODEGUERO',
    'VENTAS',
    'MESERO',
    'CAJA',
  )
  @Get('search/:term')
  search(@Param('term') term: string, @Req() req) {
    return this.inventoryService.search(term, req.user);
  }
}
