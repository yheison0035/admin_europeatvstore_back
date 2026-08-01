import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { PrismaService } from '@/prisma.service';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, PrismaService],
  imports: [PlanLimitsModule],
})
export class AppointmentsModule {}
