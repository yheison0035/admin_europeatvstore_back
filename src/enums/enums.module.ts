import { Module } from '@nestjs/common';
import { EnumsController } from './enums.controller';
import { EnumsService } from './enums.service';
import { PrismaService } from '@/prisma.service';

@Module({
  controllers: [EnumsController],
  providers: [EnumsService, PrismaService],
})
export class EnumsModule {}
