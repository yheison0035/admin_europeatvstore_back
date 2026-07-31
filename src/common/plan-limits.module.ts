import { Module } from '@nestjs/common';
import { PlanLimitsService } from './plan-limits.service';

// Módulo compartido para validar los límites por plan de cada empresa.
@Module({
  providers: [PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlanLimitsModule {}
