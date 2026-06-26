import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { WebsiteGuard } from '@/common/guards/website.guard';
import { Website } from '@/common/decorators/website.decorator';
import { WebsiteContext } from './interfaces/website-context.interface';

@Controller('website')
export class WebsiteController {
  @Public()
  @UseGuards(WebsiteGuard)
  @Get('config')
  getConfig(@Website() website: WebsiteContext) {
    return website;
  }
}
