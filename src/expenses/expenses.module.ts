import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { PrismaService } from '@/prisma.service';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, PrismaService],
  imports: [PlanLimitsModule],
  exports: [ExpensesService],
})
export class ExpensesModule {}
