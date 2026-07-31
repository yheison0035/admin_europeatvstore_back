import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PrismaService } from '../prisma.service';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, PrismaService],
  exports: [CustomersService],
  imports: [PlanLimitsModule],
})
export class CustomersModule {}
