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
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

// Administración de comunicados (solo plataforma).
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_PLATFORM_ADMIN')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user);
  }

  @Post()
  create(@Body() dto: CreateAnnouncementDto, @Req() req) {
    return this.service.create(req.user, dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnnouncementDto,
    @Req() req,
  ) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(req.user, id);
  }
}

// Comunicados vigentes para el negocio autenticado (cualquier rol con sesión).
@Controller('my-announcements')
@UseGuards(JwtAuthGuard)
export class MyAnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  mine(@Req() req) {
    return this.service.activeForUser(req.user);
  }
}
