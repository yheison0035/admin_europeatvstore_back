import { Module } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { EcommerceController } from './ecommerce.controller';
import { PrismaService } from '@/prisma.service';
import { WebsiteModule } from '@/modules/website/website.module';

@Module({
  imports: [WebsiteModule],
  controllers: [EcommerceController],
  providers: [EcommerceService, PrismaService],
})
export class EcommerceModule {}
