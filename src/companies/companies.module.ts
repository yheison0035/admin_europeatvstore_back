import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { CompanyLogoController } from './company-logo.controller';
import { CompanySettingsController } from './company-settings.controller';
import { PrismaService } from '@/prisma.service';

@Module({
  controllers: [
    CompaniesController,
    CompanyLogoController,
    CompanySettingsController,
  ],
  providers: [CompaniesService, PrismaService],
})
export class CompaniesModule {}
