import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Req,
  Put,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { UpdateSaleDto } from './dto/update-sale.dto';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get()
  findAll() {
    return this.salesService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'ASESOR')
  @Post()
  create(@Body() dto: CreateSaleDto, @Req() req) {
    return this.salesService.create(dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaleDto,
    @Req() req,
  ) {
    return this.salesService.update(id, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.remove(id);
  }

  @Get('verify/:code')
  async verify(@Param('code') code: string) {
    return this.salesService.verifySale(code);
  }
}
