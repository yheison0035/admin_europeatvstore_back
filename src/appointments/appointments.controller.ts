import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  ParseIntPipe,
  Param,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Get()
  findAll(@Req() req, @Query() query) {
    return this.service.findAllPaginated(req.user, query);
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto, @Req() req) {
    return this.service.create(dto, req.user);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAppointmentDto,
    @Req() req,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }

  @Public()
  @Get('availability')
  getAvailability(@Query() query) {
    return this.service.getAvailability(query);
  }
}
