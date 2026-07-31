import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CloudinaryModule } from '@/cloudinary/cloudinary.module';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
  imports: [CloudinaryModule, PlanLimitsModule],
})
export class UsersModule {}
