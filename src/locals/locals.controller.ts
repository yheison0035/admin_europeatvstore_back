import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  Req,
  UseGuards,
  Put,
  Query,
} from '@nestjs/common';
import { LocalsService } from './locals.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { Public } from '@/auth/decorators/public.decorator';

@Controller('locals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocalsController {
  constructor(private readonly localsService: LocalsService) {}

  @Get()
  findAll(@Req() req, @Query() query) {
    return this.localsService.findAllPaginated(req.user, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.localsService.findOne(id, req.user);
  }

  @Post()
  create(@Body() dto: CreateLocalDto, @Req() req) {
    return this.localsService.create(dto, req.user);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocalDto,
    @Req() req,
  ) {
    return this.localsService.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.localsService.remove(id, req.user);
  }
}
