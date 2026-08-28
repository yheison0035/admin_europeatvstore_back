import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { EcommerceService } from './ecommerce.service';
import { CustomerAuthService } from './customer-auth.service';
import { Public } from '@/auth/decorators/public.decorator';
import { CreateEcommerceOrderDto } from './dto/create-ecommerce-order.dto';
import {
  ForgotPasswordDto,
  LoginCustomerDto,
  RegisterCustomerDto,
  ResetPasswordDto,
  UpdateCustomerProfileDto,
} from './dto/customer-auth.dto';
import { WebsiteGuard } from '@/common/guards/website.guard';
import { CustomerJwtGuard } from '@/common/guards/customer-jwt.guard';
import { Website } from '@/common/decorators/website.decorator';
import { CurrentCustomer } from '@/common/decorators/customer.decorator';
import { WebsiteContext } from '@/modules/website/interfaces/website-context.interface';

@Controller('ecommerce')
export class EcommerceController {
  constructor(
    private readonly ecommerceService: EcommerceService,
    private readonly customerAuth: CustomerAuthService,
  ) {}

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('categories')
  getCategories(@Website() website: WebsiteContext) {
    return this.ecommerceService.getCategoriesWithProducts(website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('search/:term')
  search(@Param('term') term: string, @Website() website: WebsiteContext) {
    return this.ecommerceService.searchProducts(term, website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('novedades')
  getNovedades(@Website() website: WebsiteContext) {
    return this.ecommerceService.getNewProducts(10, website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('ofertas')
  getOfertas(@Website() website: WebsiteContext) {
    return this.ecommerceService.getOffers(10, website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('catalog')
  getCatalog(@Query() query: any, @Website() website: WebsiteContext) {
    return this.ecommerceService.getProductsCatalog(
      {
        categorySlug: query.category,
        mode: query.mode,
        colors: query.colors,
        brands: query.brands,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        sort: query.sort,
      },
      website,
    );
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('product/:slug')
  getProduct(@Param('slug') slug: string, @Website() website: WebsiteContext) {
    return this.ecommerceService.getProductBySlug(slug, website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('product/:slug/related')
  getRelatedProducts(
    @Param('slug') slug: string,
    @Query('limit') limit: string,
    @Website() website: WebsiteContext,
  ) {
    return this.ecommerceService.getRelatedProducts(
      slug,
      limit ? Number(limit) : 8,
      website,
    );
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Get('sitemap/products')
  getProductsForSitemap(@Website() website: WebsiteContext) {
    return this.ecommerceService.getProductsForSitemap(website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Post('checkout')
  async createOrder(
    @Body() dto: CreateEcommerceOrderDto,
    @Website() website: WebsiteContext,
    @Headers('authorization') authHeader?: string,
  ) {
    // Si el cliente inició sesión, se enlaza el pedido a su cuenta del CRM.
    const customerId = await this.customerAuth.tryResolveCustomerId(
      authHeader,
      website.companyId,
    );
    return this.ecommerceService.createOrder(dto, website, customerId);
  }

  // ---- Cuenta del cliente de la tienda online ----

  @Public()
  @UseGuards(WebsiteGuard)
  @Post('auth/register')
  register(
    @Body() dto: RegisterCustomerDto,
    @Website() website: WebsiteContext,
  ) {
    return this.customerAuth.register(dto, website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Post('auth/login')
  loginCustomer(
    @Body() dto: LoginCustomerDto,
    @Website() website: WebsiteContext,
  ) {
    return this.customerAuth.login(dto, website);
  }

  // TEMPORAL: diagnóstico de envío de correo (se elimina tras validar).
  @Public()
  @Get('_maildiag')
  maildiag(@Query('key') key: string, @Query('to') to: string) {
    if (key !== 'diag-9f3k2z') return { ok: false, error: 'no autorizado' };
    return this.customerAuth.mailDiag(to || 'zorvex.com@gmail.com');
  }

  // Google multi-tenant: la tienda abre esta URL con ?return=<su-origen>.
  @Public()
  @Get('auth/google/start')
  async googleStart(@Query('return') ret: string, @Res() res: Response) {
    try {
      const url = await this.customerAuth.buildGoogleAuthUrl(ret);
      return res.redirect(url);
    } catch {
      const back = ret && /^https?:\/\//.test(ret) ? ret : '';
      return res.redirect(`${back}/mi-cuenta?gerror=1`);
    }
  }

  // Callback ÚNICO al que vuelve Google para todos los dominios.
  @Public()
  @Get('auth/google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const url = await this.customerAuth.handleGoogleCallback(code, state);
    return res.redirect(url);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Post('auth/forgot-password')
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Website() website: WebsiteContext,
  ) {
    return this.customerAuth.forgotPassword(dto.email, website);
  }

  @Public()
  @UseGuards(WebsiteGuard)
  @Post('auth/reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.customerAuth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @UseGuards(WebsiteGuard, CustomerJwtGuard)
  @Get('auth/me')
  me(@CurrentCustomer() customer: { id: number }) {
    return this.customerAuth.me(customer.id);
  }

  @Public()
  @UseGuards(WebsiteGuard, CustomerJwtGuard)
  @Patch('auth/me')
  updateMe(
    @CurrentCustomer() customer: { id: number },
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.customerAuth.updateProfile(customer.id, dto);
  }
}
