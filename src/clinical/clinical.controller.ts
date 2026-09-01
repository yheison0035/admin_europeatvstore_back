import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

// Historia clínica del paciente. Solo roles clínicos/administrativos.
@Controller('clinical')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'PROFESIONAL', 'RECEPCIONISTA')
export class ClinicalController {
  constructor(private readonly service: ClinicalService) {}

  @Get(':customerId')
  get(@Param('customerId', ParseIntPipe) customerId: number, @Req() req) {
    return this.service.get(req.user, customerId);
  }

  @Put(':customerId/record')
  upsert(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: any,
    @Req() req,
  ) {
    return this.service.upsertRecord(req.user, customerId, dto);
  }

  @Post(':customerId/entry')
  addEntry(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Body() dto: any,
    @Req() req,
  ) {
    return this.service.addEntry(req.user, customerId, dto);
  }

  @Delete('entry/:id')
  removeEntry(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.removeEntry(req.user, id);
  }
}
