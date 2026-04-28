import { Controller, Get, Query } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { LocalsService } from '../locals.service';

@Controller('public/locals')
export class PublicLocalsController {
  constructor(private readonly localsService: LocalsService) {}

  @Public()
  @Get()
  findAll(@Query() query) {
    return this.localsService.findAllPublic(query);
  }
}
