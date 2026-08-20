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
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as Cloudinary } from 'cloudinary';
import { Public } from '@/auth/decorators/public.decorator';

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

  // Autoservicio de perfil: cualquier usuario autenticado, sin importar su rol,
  // puede ver y editar SUS propios datos personales (y su contraseña). El
  // servicio ignora rol/correo aunque lleguen en el body. Va antes de '/:id'
  // para que la ruta 'me' no la capture el parámetro.
  @UseGuards(JwtAuthGuard)
  @Get('me/profile')
  getMyProfile(@Req() req) {
    return this.usersService.getUserId(req.user.id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateMyProfile(@Req() req, @Body() dto: any) {
    return this.usersService.updateOwnProfile(req.user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'ASESOR', 'RECEPCIONISTA')
  @Get()
  findAll(@Req() req, @Query() query) {
    return this.usersService.findAllPaginated(req.user, query);
  }

  @Public()
  @Get('/by-role')
  getUsersByRole(@Req() req, @Query() query) {
    return this.usersService.getUsersByRole(req.user, query);
  }

  // Listado global de usuarios (todas las empresas) — solo plataforma
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_PLATFORM_ADMIN')
  @Get('platform/all')
  findAllGlobal(@Req() req, @Query() query) {
    return this.usersService.findAllGlobal(req.user, query);
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
