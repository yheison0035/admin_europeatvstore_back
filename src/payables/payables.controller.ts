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
import { PayablesService } from './payables.service';
import { CreatePayableDto } from './dto/create-payable.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('payables')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayablesController {
  constructor(private readonly service: PayablesService) {}

  @Get()
  findAll(@Req() req, @Query() query) {
    return this.service.findAllPaginated(req.user, query);
  }

  @Get('summary')
  summary(@Req() req) {
    return this.service.summary(req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Post()
  create(@Body() dto: CreatePayableDto, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Patch(':id/pay')
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req) {
    return this.service.pay(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Patch(':id/unpay')
  unpay(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.unpay(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Req() req) {
    return this.service.update(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
