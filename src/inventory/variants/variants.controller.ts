import {
  Controller,
  Param,
  Body,
  ParseIntPipe,
  Req,
  UseGuards,
  Put,
} from '@nestjs/common';
import { AddInventoryVariantsDto } from './dto/add-inventory-variants.dto';
import { VariantsService } from './variants.service';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id/variants')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddInventoryVariantsDto,
    @Req() req,
  ) {
    return this.variantsService.addVariants(id, dto.variants, req.user);
  }
}
