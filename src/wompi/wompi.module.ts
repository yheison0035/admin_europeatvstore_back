import { Module } from '@nestjs/common';
import { WompiController } from './wompi.controller';
import { WompiService } from './wompi.service';
import { PrismaService } from '@/prisma.service';

@Module({
  controllers: [WompiController],
  providers: [WompiService, PrismaService],
})
export class WompiModule {}
