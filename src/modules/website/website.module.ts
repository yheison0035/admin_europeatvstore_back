import { Module } from '@nestjs/common';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';
import { PrismaService } from '@/prisma.service';
import { CloudinaryModule } from '@/cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [WebsiteController],
  providers: [WebsiteService, PrismaService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
