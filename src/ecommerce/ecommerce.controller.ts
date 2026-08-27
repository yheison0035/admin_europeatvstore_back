import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { CustomerAuthService } from './customer-auth.service';
import { Public } from '@/auth/decorators/public.decorator';
import { CreateEcommerceOrderDto } from './dto/create-ecommerce-order.dto';
import {
  LoginCustomerDto,
  RegisterCustomerDto,
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
