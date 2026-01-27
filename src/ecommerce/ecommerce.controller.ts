import { Controller, Get, Param, Query } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { Public } from 'src/auth/decorators/public.decorator';

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
  @Get('category/:slug')
  getProductsByCategory(@Param('slug') slug: string, @Query() query: any) {
    return this.ecommerceService.getProductsByCategory(slug, query);
  }

  @Public()
  @Get('product/:slug')
  getProduct(@Param('slug') slug: string) {
    return this.ecommerceService.getProductBySlug(slug);
  }
}
