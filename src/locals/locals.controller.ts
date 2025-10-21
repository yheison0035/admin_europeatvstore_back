import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { LocalsService } from './locals.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';

@Controller('locals')
export class LocalsController {
  constructor(private readonly localsService: LocalsService) {}

  @Get()
  findAll() {
    return this.localsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.localsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateLocalDto) {
    return this.localsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocalDto) {
    return this.localsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.localsService.remove(id);
  }
}
