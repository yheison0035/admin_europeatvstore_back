import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PublicProfessionalsController } from './public/users.public.controller';
import { UsersService } from './users.service';
import { CloudinaryModule } from '@/cloudinary/cloudinary.module';
import { PlanLimitsModule } from '@/common/plan-limits.module';

@Module({
  controllers: [UsersController, PublicProfessionalsController],
  providers: [UsersService],
  exports: [UsersService],
  imports: [CloudinaryModule, PlanLimitsModule],
})
export class UsersModule {}
