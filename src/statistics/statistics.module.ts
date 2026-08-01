import { Module } from '@nestjs/common';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { PlanLimitsModule } from '@/common/plan-limits.module';

// PrismaService viene del PrismaModule global; no se re-provee para no crear
// otra instancia (pool de conexiones) del cliente.
@Module({
  controllers: [StatisticsController],
  providers: [StatisticsService],
  imports: [PlanLimitsModule],
})
export class StatisticsModule {}
