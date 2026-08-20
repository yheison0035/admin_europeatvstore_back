import { Module } from '@nestjs/common';
import { ComandasService } from './comandas.service';
import { ComandasController } from './comandas.controller';
import { PrismaService } from '@/prisma.service';

@Module({
  controllers: [ComandasController],
  providers: [ComandasService, PrismaService],
})
export class ComandasModule {}
