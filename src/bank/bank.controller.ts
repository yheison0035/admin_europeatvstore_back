import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BankService } from './bank.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

const VIEW_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPCIONISTA',
  'CAJA',
  'ASESOR',
  'VENTAS',
];
const OWNER_ROLES = ['SUPER_ADMIN', 'ADMIN'];

@Controller('bank')
export class BankController {
  constructor(private readonly service: BankService) {}

  // ===== Webhook PÚBLICO (lo llama el reenviador de SMS del celular) =====
  // Acepta POST con { text | message | sms | amount | name } o GET con ?text=.
  @Post('sms/:token')
  receiveSmsPost(@Param('token') token: string, @Body() body: any) {
    return this.service.receiveSms(token, body || {});
  }

  @Get('sms/:token')
  receiveSmsGet(@Param('token') token: string, @Query() query: any) {
    return this.service.receiveSms(token, query || {});
  }

  // ===== Rutas autenticadas =====
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Post('enable')
  enable(@Req() req, @Body() body: any) {
    return this.service.enable(req.user, body || {});
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Patch('config')
  setConfig(@Req() req, @Body() body: any) {
    return this.service.setConfig(req.user, body || {});
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Post('disable')
  disable(@Req() req) {
    return this.service.disable(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Post('regenerate')
  regenerate(@Req() req) {
    return this.service.regenerate(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Get('status')
  status(@Req() req) {
    return this.service.status(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Post('test')
  sendTest(@Req() req) {
    return this.service.sendTest(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...VIEW_ROLES)
  @Get('deposits')
  list(@Req() req, @Query() query: any) {
    return this.service.list(req.user, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...VIEW_ROLES)
  @Get('deposits/pending')
  pending(@Req() req) {
    return this.service.pending(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...VIEW_ROLES)
  @Patch('deposits/:id/seen')
  markSeen(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.markSeen(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...VIEW_ROLES)
  @Patch('deposits/seen-all')
  markAllSeen(@Req() req) {
    return this.service.markAllSeen(req.user);
  }

  // Borrar registros: solo dueño/administrador.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Delete('deposits/all')
  clearAll(@Req() req) {
    return this.service.clearAll(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...OWNER_ROLES)
  @Delete('deposits/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(req.user, id);
  }
}
