import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaService } from '@/prisma.service';
import { InventoryModule } from '@/inventory/inventory.module';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  imports: [InventoryModule, PlanLimitsModule],
  controllers: [SalesController],
  providers: [SalesService, PrismaService],
  exports: [SalesService],
})
export class SalesModule {}
