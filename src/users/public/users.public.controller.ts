import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { UsersService } from '../users.service';

// Endpoints públicos para la reserva de citas (sin iniciar sesión).
@Controller('public/professionals')
export class PublicProfessionalsController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Get()
  findAll(@Query() query) {
    return this.usersService.getPublicProfessionals(query);
  }
}
