import { Module } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { ClinicalController } from './clinical.controller';
import { PrismaService } from '@/prisma.service';

@Module({
  controllers: [ClinicalController],
  providers: [ClinicalService, PrismaService],
})
export class ClinicalModule {}
