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
import { CashService } from './cash.service';
import { OpenCashDto, CashMovementDto, CloseCashDto } from './dto/cash.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

const CASH_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPCIONISTA',
  'ASESOR',
  'CAJA',
  'VENTAS',
] as const;

@Controller('cash')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Roles(...CASH_ROLES)
  @Get('current')
  current(@Req() req, @Query('localId') localId: string) {
    return this.cashService.getCurrent(req.user, Number(localId));
  }

  @Roles(...CASH_ROLES)
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.cashService.findAll(req.user, query);
  }

  @Roles(...CASH_ROLES)
  @Post('open')
  open(@Body() dto: OpenCashDto, @Req() req) {
    return this.cashService.open(req.user, dto);
  }

  @Roles(...CASH_ROLES)
  @Post(':id/movement')
  addMovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CashMovementDto,
    @Req() req,
  ) {
    return this.cashService.addMovement(req.user, id, dto);
  }

  // Reabrir una caja cerrada: solo dueño/administrador.
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/reopen')
  reopen(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.cashService.reopen(req.user, id);
  }

  @Roles(...CASH_ROLES)
  @Post(':id/close')
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseCashDto,
    @Req() req,
  ) {
    return this.cashService.close(req.user, id, dto);
  }

  @Roles(...CASH_ROLES)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.cashService.findOne(req.user, id);
  }
}
