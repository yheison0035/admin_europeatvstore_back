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
import { QuotesService } from './quotes.service';
import { CreateQuoteDto, ConvertQuoteDto } from './dto/quote.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPCIONISTA',
  'ASESOR',
  'VENTAS',
] as const;

@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Roles(...ROLES)
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.quotesService.findAll(req.user, query);
  }

  @Roles(...ROLES)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.quotesService.findOne(req.user, id);
  }

  @Roles(...ROLES)
  @Post()
  create(@Body() dto: CreateQuoteDto, @Req() req) {
    return this.quotesService.create(req.user, dto);
  }

  @Roles(...ROLES)
  @Patch(':id/accept')
  accept(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.quotesService.setStatus(req.user, id, 'ACEPTADA');
  }

  @Roles(...ROLES)
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.quotesService.setStatus(req.user, id, 'RECHAZADA');
  }

  @Roles(...ROLES)
  @Post(':id/convert')
  convert(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertQuoteDto,
    @Req() req,
  ) {
    return this.quotesService.convert(req.user, id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.quotesService.remove(req.user, id);
  }
}
