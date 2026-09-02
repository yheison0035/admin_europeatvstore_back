import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { PlatformPlansController } from './platform-plans.controller';
import { PlatformPlansService } from './platform-plans.service';

// PlansConfigService viene del módulo global PlansConfigModule.
@Module({
  controllers: [PlatformPlansController],
  providers: [PlatformPlansService, PrismaService],
})
export class PlatformPlansModule {}
