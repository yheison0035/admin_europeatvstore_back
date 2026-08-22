import { Module } from '@nestjs/common';
import { ComandasService } from './comandas.service';
import { ComandasController } from './comandas.controller';
import { PrismaService } from '@/prisma.service';
import { SalesModule } from '@/sales/sales.module';

@Module({
  imports: [SalesModule],
  controllers: [ComandasController],
  providers: [ComandasService, PrismaService],
})
export class ComandasModule {}
