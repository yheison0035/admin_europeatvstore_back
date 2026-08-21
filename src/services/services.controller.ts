import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Req,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { ServicesService } from './services.service';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Public } from '@/auth/decorators/public.decorator';

@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  findAll(@Req() req, @Query() query) {
    return this.service.findAllPaginated(req.user, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.findOne(id, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Post()
  create(@Body() dto: CreateServiceDto, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA')
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @Req() req,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
