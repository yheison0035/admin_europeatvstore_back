import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { CreateEcommerceOrderDto } from './dto/create-ecommerce-order.dto';

@Controller('ecommerce')
export class EcommerceController {
  constructor(private readonly ecommerceService: EcommerceService) {}

  @Public()
  @Get('categories')
  getCategories() {
    return this.ecommerceService.getCategoriesWithProducts();
  }

  @Public()
  @Get('search/:term')
  search(@Param('term') term: string) {
    return this.ecommerceService.searchProducts(term);
  }

  @Public()
  @Get('novedades')
  getNovedades() {
    return this.ecommerceService.getNewProducts(10);
  }

  @Public()
  @Get('ofertas')
  getOfertas() {
    return this.ecommerceService.getOffers(10);
  }

  @Public()
  @Get('catalog')
  getCatalog(@Query() query: any) {
    return this.ecommerceService.getProductsCatalog({
      categorySlug: query.category,
      mode: query.mode,
      colors: query.colors,
      brands: query.brands,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
    });
  }

  @Public()
  @Get('product/:slug')
  getProduct(@Param('slug') slug: string) {
    return this.ecommerceService.getProductBySlug(slug);
  }

  @Public()
  @Get('product/:slug/related')
  getRelatedProducts(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
  ) {
    return this.ecommerceService.getRelatedProducts(
      slug,
      limit ? Number(limit) : 8,
    );
  }

  @Public()
  @Get('sitemap/products')
  getProductsForSitemap() {
    return this.ecommerceService.getProductsForSitemap();
  }

  @Post('checkout')
  @Public()
  createOrder(@Body() dto: CreateEcommerceOrderDto) {
    return this.ecommerceService.createOrder(dto);
  }
}
