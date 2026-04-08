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
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ServicesService } from './service.service';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user);
  }

  @Post()
  create(@Body() dto, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto, @Req() req) {
    return this.service.update(Number(id), dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Req() req) {
    return this.service.remove(Number(id), req.user);
  }
}
