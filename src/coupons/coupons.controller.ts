import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CouponsService } from './coupons.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

// Administración de cupones (solo SUPER_PLATFORM_ADMIN)
@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_PLATFORM_ADMIN')
export class CouponsController {
  constructor(private readonly service: CouponsService) {}

  @Get()
  findAll(@Req() req, @Query() query) {
    return this.service.findAllPaginated(req.user, query);
  }

  @Post()
  create(@Body() dto: CreateCouponDto, @Req() req) {
    return this.service.create(req.user, dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCouponDto,
    @Req() req,
  ) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.service.remove(req.user, id);
  }
}

// Validación pública de un cupón (usada en el registro). No requiere sesión.
@Controller('coupons')
export class PublicCouponsController {
  constructor(private readonly service: CouponsService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('validate')
  validate(@Body() body: { code: string; plan: string }) {
    return this.service.validateForPlanPublic(body?.code, body?.plan);
  }
}
