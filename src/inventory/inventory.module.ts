import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  imports: [CloudinaryModule],
})
export class InventoryModule {}
