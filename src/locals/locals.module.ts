import { Module } from '@nestjs/common';
import { LocalsService } from './locals.service';
import { LocalsController } from './locals.controller';
import { PrismaService } from '@/prisma.service';
import { PublicLocalsController } from './public/locals.public.controller';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  controllers: [LocalsController, PublicLocalsController],
  providers: [LocalsService, PrismaService],
  imports: [PlanLimitsModule],
})
export class LocalsModule {}
