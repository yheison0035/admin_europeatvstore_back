import { Module } from '@nestjs/common';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';
import { PrismaService } from '@/prisma.service';
import { CloudinaryModule } from '@/cloudinary/cloudinary.module';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  imports: [CloudinaryModule, PlanLimitsModule],
  controllers: [WebsiteController],
  providers: [WebsiteService, PrismaService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
