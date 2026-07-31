import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UpdateUserDto } from '@/users/dto/update-user.dto';
import { UsersService } from '@/users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotOtpDto } from './dto/forgot-otp.dto';
import { ResetOtpDto } from './dto/reset-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  // Registro de usuario (solo ADMIN debería usarlo)
  @UseGuards(JwtAuthGuard)
  @Post('register')
  async register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  // Máximo 5 intentos de login por minuto y por IP (anti fuerza bruta)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Solicitar enlace de restablecimiento (público). Límite anti-abuso.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  // Restablecer con el token del correo (público).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  // Código OTP por WhatsApp (público).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password-otp')
  forgotPasswordOtp(@Body() dto: ForgotOtpDto) {
    return this.authService.requestPasswordOtp(dto.identifier);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password-otp')
  resetPasswordOtp(@Body() dto: ResetOtpDto) {
    return this.authService.resetPasswordWithOtp(
      dto.identifier,
      dto.code,
      dto.password,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req) {
    return this.usersService.getUserId(req.user.id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateProfile(@Req() req, @Body() data: UpdateUserDto) {
    return this.usersService.updateUser(req.user.id, data, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  async changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }
}
