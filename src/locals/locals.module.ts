import { Module } from '@nestjs/common';
import { LocalsService } from './locals.service';
import { LocalsController } from './locals.controller';
import { PrismaService } from '@/prisma.service';
import { PublicLocalsController } from './public/locals.public.controller';

@Module({
  controllers: [LocalsController, PublicLocalsController],
  providers: [LocalsService, PrismaService],
})
export class LocalsModule {}
