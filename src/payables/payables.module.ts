import { Module } from '@nestjs/common';
import { PayablesService } from './payables.service';
import { PayablesController } from './payables.controller';
import { PrismaService } from '@/prisma.service';
import { ExpensesModule } from '@/expenses/expenses.module';

@Module({
  controllers: [PayablesController],
  providers: [PayablesService, PrismaService],
  imports: [ExpensesModule],
})
export class PayablesModule {}
