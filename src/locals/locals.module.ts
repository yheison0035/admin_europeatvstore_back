import { Module } from '@nestjs/common';
import { LocalsService } from './locals.service';
import { LocalsController } from './locals.controller';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [LocalsController],
  providers: [LocalsService, PrismaService],
})
export class LocalsModule {}
