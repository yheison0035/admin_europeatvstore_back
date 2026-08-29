import { Module } from '@nestjs/common';
import { EmployeeChargesService } from './employee-charges.service';
import { EmployeeChargesController } from './employee-charges.controller';
import { PrismaService } from '@/prisma.service';

@Module({
  controllers: [EmployeeChargesController],
  providers: [EmployeeChargesService, PrismaService],
})
export class EmployeeChargesModule {}
