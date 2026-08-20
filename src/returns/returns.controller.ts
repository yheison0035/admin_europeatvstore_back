import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/return.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA', 'ASESOR'] as const;

@Controller('returns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Roles(...ROLES)
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.returnsService.findAll(req.user, query);
  }

  // Trae una venta lista para devolver (con cantidades restantes). Antes de :id.
  @Roles(...ROLES)
  @Get('sale/:saleId')
  saleForReturn(@Param('saleId', ParseIntPipe) saleId: number, @Req() req) {
    return this.returnsService.getSaleForReturn(req.user, saleId);
  }

  @Roles(...ROLES)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.returnsService.findOne(req.user, id);
  }

  @Roles(...ROLES)
  @Post()
  create(@Body() dto: CreateReturnDto, @Req() req) {
    return this.returnsService.create(req.user, dto);
  }
}
