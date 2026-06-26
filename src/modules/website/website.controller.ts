import { Controller, Get, Headers } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { WebsiteService } from './website.service';

@Controller('website')
export class WebsiteController {
  constructor(private readonly websiteService: WebsiteService) {}

  @Public()
  @Get('config')
  async getConfig(@Headers('host') host: string) {
    return this.websiteService.resolveCompany(host);
  }
}
