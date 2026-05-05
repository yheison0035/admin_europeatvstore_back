import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CloudinaryModule } from '@/cloudinary/cloudinary.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
  imports: [CloudinaryModule],
})
export class UsersModule {}
