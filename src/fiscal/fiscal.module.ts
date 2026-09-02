import { Module } from '@nestjs/common';
import { MailService } from '@/mail/mail.service';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';

@Module({
  controllers: [FiscalController],
  providers: [FiscalService, MailService],
})
export class FiscalModule {}
