import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as Cloudinary } from 'cloudinary';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload-avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Req() req) {
    return this.usersService.updateAvatar(req.user.id, file, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('avatar')
  async deleteAvatar(@Req() req) {
    return this.usersService.deleteAvatar(req.user.id, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.usersService.findAllPaginated(req.user, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'AUXILIAR', 'ASESOR')
  @Get('/:id')
  getUser(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.usersService.getUserId(id, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  createUser(@Body() user: CreateUserDto, @Req() req) {
    return this.usersService.createUser(user, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put('/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() user: UpdateUserDto,
    @Req() req,
  ) {
    return this.usersService.updateUser(id, user, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete('/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.usersService.deleteUser(id, req.user);
  }
}
