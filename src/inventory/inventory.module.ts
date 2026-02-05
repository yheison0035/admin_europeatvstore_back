import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { VariantsModule } from './variants/variants.module';
import { StockService } from './stock.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, StockService],
  imports: [CloudinaryModule, VariantsModule],
  exports: [StockService],
})
export class InventoryModule {}
