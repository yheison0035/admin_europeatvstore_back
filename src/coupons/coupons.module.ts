import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import {
  CouponsController,
  PublicCouponsController,
} from './coupons.controller';

@Module({
  controllers: [CouponsController, PublicCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
