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
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Public } from '@/auth/decorators/public.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Get()
  findAll(@Req() req, @Query() query) {
    return this.service.findAllPaginated(req.user, query);
  }

  @Public()
  @Get('availability')
  getAvailability(@Query() query) {
    return this.service.getAvailability(query);
  }

  // Agenda de hoy + mañana (modal de inicio y recordatorios). Debe declararse
  // antes de :id para que "agenda" no se interprete como un id.
  @Get('agenda')
  agenda(@Req() req) {
    return this.service.getAgenda(req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.findOne(id, req.user);
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

  // Marca la cita como confirmada (o no) con el cliente. Body: { confirmed }.
  @Patch(':id/client-confirm')
  clientConfirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { confirmed?: boolean },
    @Req() req,
  ) {
    return this.service.setClientConfirmed(id, body?.confirmed !== false, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
