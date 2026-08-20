import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

const VIEW_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPCIONISTA',
  'ASESOR',
  'BODEGUERO',
] as const;
const EDIT_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPCIONISTA',
  'BODEGUERO',
] as const;

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Roles(...VIEW_ROLES)
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.purchasesService.findAll(req.user, query);
  }

  @Roles(...VIEW_ROLES)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.purchasesService.findOne(req.user, id);
  }

  @Roles(...EDIT_ROLES)
  @Post()
  create(@Body() dto: CreatePurchaseDto, @Req() req) {
    return this.purchasesService.create(req.user, dto);
  }

  @Roles(...EDIT_ROLES)
  @Patch(':id/receive')
  receive(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.purchasesService.receive(req.user, id);
  }

  @Roles(...EDIT_ROLES)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.purchasesService.cancel(req.user, id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.purchasesService.remove(req.user, id);
  }
}
