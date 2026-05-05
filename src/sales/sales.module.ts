import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaService } from '@/prisma.service';
import { InventoryModule } from '@/inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [SalesController],
  providers: [SalesService, PrismaService],
})
export class SalesModule {}
