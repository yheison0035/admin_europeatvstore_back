import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import {
  AnnouncementsController,
  MyAnnouncementsController,
} from './announcements.controller';

@Module({
  controllers: [AnnouncementsController, MyAnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
