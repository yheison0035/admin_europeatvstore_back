import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { ServicesService } from '../services.service';

@Controller('public/services')
export class PublicServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get()
  findAll(@Query() query) {
    return this.servicesService.findAllPublic(query);
  }
}
