import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { WebsiteGuard } from '@/common/guards/website.guard';
import { Website } from '@/common/decorators/website.decorator';
import { WebsiteContext } from './interfaces/website-context.interface';
import { WebsiteService } from './website.service';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import {
  CreateWebsiteBannerDto,
  UpdateWebsiteBannerDto,
} from './dto/website-banner.dto';

@Controller('website')
export class WebsiteController {
  constructor(private readonly service: WebsiteService) {}

  /** Configuración pública: la consume la tienda según su dominio. */
  @Public()
  @UseGuards(WebsiteGuard)
  @Get('config')
  getConfig(@Website() website: WebsiteContext) {
    return website;
  }

  /* ==========================================================
     ADMINISTRACIÓN DEL SITIO (desde el CRM)
     ========================================================== */

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'SUPER_PLATFORM_ADMIN')
  @Get('admin/config')
  getAdminConfig(@Req() req, @Query('companyId') companyId?: string) {
    return this.service.getAdminConfig(
      req.user,
      companyId ? Number(companyId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'SUPER_PLATFORM_ADMIN')
  @Put('admin/config')
  updateConfig(
    @Req() req,
    @Body() dto: UpdateWebsiteDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.updateConfig(
      req.user,
      dto,
      companyId ? Number(companyId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'SUPER_PLATFORM_ADMIN')
  @Post('admin/banners')
  createBanner(
    @Req() req,
    @Body() dto: CreateWebsiteBannerDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.createBanner(
      req.user,
      dto,
      companyId ? Number(companyId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'SUPER_PLATFORM_ADMIN')
  @Put('admin/banners/:id')
  updateBanner(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWebsiteBannerDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.updateBanner(
      req.user,
      id,
      dto,
      companyId ? Number(companyId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'SUPER_PLATFORM_ADMIN')
  @Delete('admin/banners/:id')
  removeBanner(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.removeBanner(
      req.user,
      id,
      companyId ? Number(companyId) : undefined,
    );
  }
}
