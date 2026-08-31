import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { ElectronicInvoicingService } from './electronic-invoicing.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('electronic-invoicing')
export class ElectronicInvoicingController {
  constructor(private readonly service: ElectronicInvoicingService) {}

  @Get('config')
  getConfig(@Req() req) {
    return this.service.getConfig(req.user);
  }

  @Put('config')
  saveConfig(@Req() req, @Body() dto: any) {
    return this.service.saveConfig(req.user, dto);
  }

  @Post('test')
  test(@Req() req) {
    return this.service.testConnection(req.user);
  }

  @Get('numbering-ranges')
  numberingRanges(@Req() req) {
    return this.service.numberingRanges(req.user);
  }

  @Post('emit/:saleId')
  emit(@Req() req, @Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.emitForSale(req.user, saleId);
  }

  @Get('sale/:saleId')
  getForSale(@Req() req, @Param('saleId', ParseIntPipe) saleId: number) {
    return this.service.getForSale(req.user, saleId);
  }
}
