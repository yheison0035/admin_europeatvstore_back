import { Module } from '@nestjs/common';
import { ElectronicInvoicingController } from './electronic-invoicing.controller';
import { ElectronicInvoicingService } from './electronic-invoicing.service';

@Module({
  controllers: [ElectronicInvoicingController],
  providers: [ElectronicInvoicingService],
  exports: [ElectronicInvoicingService],
})
export class ElectronicInvoicingModule {}
