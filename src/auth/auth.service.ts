import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma.service';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '@/users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailService } from '@/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private usersService: UsersService,
    private mail: MailService,
  ) {}

  // Solicitud de restablecimiento: envía un enlace al correo si existe. Siempre
  // responde igual para no revelar qué correos están registrados.
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: (email || '').trim().toLowerCase() },
    });

    if (user && user.status !== 'ELIMINADO') {
      // El token se firma con un secreto que incluye el hash actual de la
      // contraseña: así queda inválido en cuanto la contraseña cambia (un solo
      // uso efectivo) y vence a los 30 minutos.
      const secret = (process.env.JWT_SECRET || '') + user.password;
      const token = await this.jwtService.signAsync(
        { sub: user.id },
        { secret, expiresIn: '30m' },
      );

      const base = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${base}/reset-password?token=${token}`;

      await this.mail.sendPasswordReset(user.email, resetUrl, user.name);
    }

    return {
      success: true,
      message:
        'Si el correo está registrado, te enviamos las instrucciones para restablecer la contraseña.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const decoded: any = this.jwtService.decode(token);
    if (!decoded?.sub) {
      throw new BadRequestException('Enlace inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
    });
    if (!user) {
      throw new BadRequestException('Enlace inválido');
    }

    const secret = (process.env.JWT_SECRET || '') + user.password;
    try {
      await this.jwtService.verifyAsync(token, { secret });
    } catch {
      throw new BadRequestException(
        'El enlace expiró o ya no es válido. Solicita uno nuevo.',
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    return {
      success: true,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
    };
  }

  async register(dto: CreateUserDto) {
    const user = await this.usersService.createUser(dto);
    return { message: 'Usuario creado', user };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            type: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.status === 'INACTIVO') {
      throw new UnauthorizedException('Tu usuario está inactivo');
    }

    if (!user.companyId && user.role !== 'SUPER_PLATFORM_ADMIN') {
      throw new UnauthorizedException('Usuario sin empresa asignada');
    }

    // Suspensión por impago: si la empresa no está ACTIVA, no se permite el
    // acceso (el SUPER_PLATFORM_ADMIN es de plataforma y no depende de empresa).
    if (
      user.role !== 'SUPER_PLATFORM_ADMIN' &&
      user.company &&
      user.company.status !== 'ACTIVO'
    ) {
      throw new UnauthorizedException(
        'Tu empresa está suspendida. Contacta al administrador.',
      );
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      localId: user.localId,
    };

    const { password, ...safeUser } = user;

    return {
      success: true,
      message: 'Login exitoso',
      data: {
        access_token: await this.jwtService.signAsync(payload),
        user: {
          ...safeUser,
          company: user.company ?? null,
        },
      },
    };
  }

  async validateUser(userId: number) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { success: true, message: 'Contraseña actualizada correctamente' };
  }
}
