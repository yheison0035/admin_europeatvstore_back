import { Module } from '@nestjs/common';
import { WompiController } from './wompi.controller';
import { WompiService } from './wompi.service';
import { PrismaService } from '@/prisma.service';
import { WebsiteModule } from '@/modules/website/website.module';

@Module({
  imports: [WebsiteModule],
  controllers: [WompiController],
  providers: [WompiService, PrismaService],
  exports: [WompiService],
})
export class WompiModule {}
