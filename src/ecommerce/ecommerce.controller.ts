import { Controller, Get, Param } from '@nestjs/common';
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
}
