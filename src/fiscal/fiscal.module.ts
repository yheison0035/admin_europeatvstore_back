import { Module } from '@nestjs/common';
import { MailService } from '@/mail/mail.service';
import { PlanLimitsService } from '@/common/plan-limits.service';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';

@Module({
  controllers: [FiscalController],
  providers: [FiscalService, MailService, PlanLimitsService],
})
export class FiscalModule {}
