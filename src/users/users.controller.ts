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

  // Endpoint para subir avatar
  // Autenticación requerida
  // Usa Multer para manejar la subida de archivos
  // El archivo se espera en el campo 'file' del formulario
  // El avatar se asocia al usuario autenticado (req.user.userId)
  // El servicio maneja la lógica de subir a Cloudinary y actualizar la URL en la base de datos
  @UseGuards(JwtAuthGuard)
  @Post('upload-avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Req() req) {
    return this.usersService.updateAvatar(req.user.userId, file);
  }

  // Endpoint para eliminar avatar
  @UseGuards(JwtAuthGuard)
  @Delete('avatar')
  async deleteAvatar(@Req() req) {
    return this.usersService.deleteAvatar(req.user.userId);
  }

  // Solo ADMIN puede listar todos los usuarios
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COORDINADOR', 'ASESOR')
  @Get()
  getAllUsers(@Req() req) {
    return this.usersService.getUsers(req.user); // se pasa user para validar permisos en el service
  }

  // ADMIN puede consultar cualquier usuario
  // ASESOR solo puede consultar su propio perfil
  @UseGuards(JwtAuthGuard)
  @Get('/:id')
  getUser(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.usersService.getUserId(id, req.user);
  }

  // Solo ADMIN puede crear usuarios
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post()
  createUser(@Body() user: CreateUserDto, @Req() req) {
    return this.usersService.createUser(user, req.user);
  }

  // ADMIN puede actualizar cualquier usuario
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put('/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() user: UpdateUserDto,
    @Req() req,
  ) {
    return this.usersService.updateUser(id, user, req.user);
  }

  // ADMIN puede eliminar usuarios
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete('/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.usersService.deleteUser(id, req.user);
  }

  // ADMIN puede alternar rol (ejemplo)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('/:id/toggle-role')
  updateUserSegment(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.usersService.updateUserSegment(id, req.user);
  }
}
