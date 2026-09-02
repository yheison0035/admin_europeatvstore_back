import { Module } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { ClinicalController } from './clinical.controller';
import { PrismaService } from '@/prisma.service';
import { PlanLimitsService } from '@/common/plan-limits.service';

@Module({
  controllers: [ClinicalController],
  providers: [ClinicalService, PrismaService, PlanLimitsService],
})
export class ClinicalModule {}
