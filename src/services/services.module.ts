import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { PrismaService } from '@/prisma.service';
import { ServicesService } from './services.service';
import { PublicServicesController } from './public/services.public.controller';

@Module({
  controllers: [ServicesController, PublicServicesController],
  providers: [ServicesService, PrismaService],
})
export class ServicesModule {}
