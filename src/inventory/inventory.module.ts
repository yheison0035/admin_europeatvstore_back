import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { VariantsModule } from './variants/variants.module';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  imports: [CloudinaryModule, VariantsModule],
})
export class InventoryModule {}
