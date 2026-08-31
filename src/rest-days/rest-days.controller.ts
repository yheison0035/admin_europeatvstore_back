import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { RestDaysService } from './rest-days.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('rest-days')
export class RestDaysController {
  constructor(private readonly service: RestDaysService) {}

  @Get('professionals')
  professionals(@Req() req) {
    return this.service.professionals(req.user);
  }

  @Get(':userId')
  getForUser(@Req() req, @Param('userId', ParseIntPipe) userId: number) {
    return this.service.getForUser(req.user, userId);
  }

  @Put(':userId/weekdays')
  setWeekdays(
    @Req() req,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: any,
  ) {
    return this.service.setWeekdays(req.user, userId, dto);
  }

  @Post(':userId/time-off')
  addTimeOff(
    @Req() req,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: any,
  ) {
    return this.service.addTimeOff(req.user, userId, dto);
  }

  @Delete('time-off/:id')
  removeTimeOff(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.removeTimeOff(req.user, id);
  }
}
