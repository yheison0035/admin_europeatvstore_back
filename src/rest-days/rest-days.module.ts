import { Module } from '@nestjs/common';
import { RestDaysController } from './rest-days.controller';
import { RestDaysService } from './rest-days.service';

@Module({
  controllers: [RestDaysController],
  providers: [RestDaysService],
  exports: [RestDaysService],
})
export class RestDaysModule {}
