import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { FiscalService } from './fiscal.service';

// Facturación electrónica DIAN vía la Pegazo Fiscal API (integración propia).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('fiscal')
export class FiscalController {
  constructor(private readonly service: FiscalService) {}

  @Get('status')
  status(@Req() req) {
    return this.service.status(req.user);
  }

  @Post('setup')
  setup(@Req() req) {
    return this.service.setup(req.user);
  }

  @Post('resolutions')
  addResolution(@Req() req, @Body() dto: any) {
    return this.service.addResolution(req.user, dto);
  }

  @Get('documents')
  documents(@Req() req, @Query() query: any) {
    return this.service.listDocuments(req.user, query);
  }

  @Get('stats')
  stats(@Req() req) {
    return this.service.stats(req.user);
  }

  @Post('emit/:saleId')
  emit(@Req() req, @Param('saleId') saleId: string) {
    return this.service.emitForSale(req.user, Number(saleId));
  }

  @Post('credit-notes')
  createCreditNote(@Req() req, @Body() dto: any) {
    return this.service.createCreditNote(req.user, dto);
  }

  @Post('test-invoice')
  emitTest(@Req() req) {
    return this.service.emitTest(req.user);
  }

  @Get('documents/:id')
  getDocument(@Req() req, @Param('id') id: string) {
    return this.service.getDocument(req.user, id);
  }

  @Post('documents/:id/send-email')
  sendEmail(@Req() req, @Param('id') id: string) {
    return this.service.sendEmail(req.user, id);
  }

  @Get('documents/:id/whatsapp')
  whatsapp(@Req() req, @Param('id') id: string) {
    return this.service.whatsappLink(req.user, id);
  }

  @Delete('documents/:id')
  deleteDocument(@Req() req, @Param('id') id: string) {
    return this.service.deleteDocument(req.user, id);
  }

  @Post('documents/:id/annul')
  annul(@Req() req, @Param('id') id: string, @Body() body: any) {
    return this.service.annulDocument(req.user, id, body?.reason);
  }

  @Get('documents/:id/representation')
  @Header('Content-Type', 'text/html; charset=utf-8')
  representation(@Req() req, @Param('id') id: string) {
    return this.service.representation(req.user, id);
  }
}
