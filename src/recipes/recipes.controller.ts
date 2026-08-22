import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RecipesService } from './recipes.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { SetRecipeDto } from './dto/set-recipe.dto';

@Controller('recipes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecipesController {
  constructor(private readonly service: RecipesService) {}

  @Get(':inventoryId')
  get(@Param('inventoryId', ParseIntPipe) inventoryId: number, @Req() req) {
    return this.service.getRecipe(inventoryId, req.user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':inventoryId')
  set(
    @Param('inventoryId', ParseIntPipe) inventoryId: number,
    @Body() dto: SetRecipeDto,
    @Req() req,
  ) {
    return this.service.setRecipe(inventoryId, dto, req.user);
  }
}
