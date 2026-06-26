import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { Public } from '@/auth/decorators/public.decorator';
import { CreateEcommerceOrderDto } from './dto/create-ecommerce-order.dto';
import { WebsiteGuard } from '@/common/guards/website.guard';
import { Website } from '@/common/decorators/website.decorator';
import { WebsiteContext } from '@/modules/website/interfaces/website-context.interface';

@Controller('ecommerce')
export class EcommerceController {
  constructor(private readonly ecommerceService: EcommerceService) {}

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
  createOrder(
    @Body() dto: CreateEcommerceOrderDto,
    @Website() website: WebsiteContext,
  ) {
    return this.ecommerceService.createOrder(dto, website);
  }
}
