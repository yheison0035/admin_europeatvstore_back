import { Module } from '@nestjs/common';
import { ChargeCategoriesController } from './charge-categories.controller';
import { ChargeCategoriesService } from './charge-categories.service';

@Module({
  controllers: [ChargeCategoriesController],
  providers: [ChargeCategoriesService],
  exports: [ChargeCategoriesService],
})
export class ChargeCategoriesModule {}
