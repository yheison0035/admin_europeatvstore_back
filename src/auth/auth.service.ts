import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BusinessType, Role, Status } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma.service';
import { CreateUserDto } from '@/users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '@/users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailService } from '@/mail/mail.service';
import { WhatsappService } from '@/mail/whatsapp.service';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { CouponsService } from '@/coupons/coupons.service';
import { randomInt } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private usersService: UsersService,
    private mail: MailService,
    private whatsapp: WhatsappService,
    private coupons: CouponsService,
  ) {}

  // Busca un usuario por correo o por celular (identificador flexible).
  private async findByIdentifier(identifier: string) {
    const id = (identifier || '').trim();
    if (!id) return null;

    if (id.includes('@')) {
      return this.prisma.user.findUnique({ where: { email: id.toLowerCase() } });
    }

    const phone = id.replace(/\D/g, '');
    return this.prisma.user.findFirst({
      where: { phone: { contains: phone.slice(-10) } },
    });
  }

  // Solicita un código OTP y lo envía por WhatsApp al celular registrado.
  // Respuesta uniforme para no revelar si la cuenta existe.
  async requestPasswordOtp(identifier: string) {
    const user = await this.findByIdentifier(identifier);

    if (user && user.status !== 'ELIMINADO' && user.phone) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const hash = await bcrypt.hash(code, 10);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetOtpHash: hash,
          resetOtpExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 min
          resetOtpAttempts: 0,
        },
      });

      await this.whatsapp.sendOtp(user.phone, code);
    }

    return {
      success: true,
      message:
        'Si la cuenta existe y tiene celular registrado, te enviamos un código por WhatsApp.',
    };
  }

  async resetPasswordWithOtp(
    identifier: string,
    code: string,
    newPassword: string,
  ) {
    const user = await this.findByIdentifier(identifier);

    if (
      !user ||
      !user.resetOtpHash ||
      !user.resetOtpExpires ||
      user.resetOtpExpires < new Date()
    ) {
      throw new BadRequestException(
        'El código no es válido o venció. Solicita uno nuevo.',
      );
    }

    if (user.resetOtpAttempts >= 5) {
      throw new BadRequestException(
        'Demasiados intentos. Solicita un código nuevo.',
      );
    }

    const ok = await bcrypt.compare(code, user.resetOtpHash);
    if (!ok) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetOtpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Código incorrecto.');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetOtpHash: null,
        resetOtpExpires: null,
        resetOtpAttempts: 0,
      },
    });

    return {
      success: true,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
    };
  }

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

  // AUTO-REGISTRO DE NEGOCIO (público): crea la empresa + su usuario
  // administrador (SUPER_ADMIN) de forma atómica y devuelve un token para que
  // entre directamente. Empieza en el plan gratuito (Despegue).
  async registerBusiness(dto: RegisterBusinessDto) {
    const email = dto.email.trim().toLowerCase();

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }

    // Tipo de negocio válido: si tiene fila de config manda su estado (un base
    // desactivado queda inválido); sin fila, se acepta solo si es base del enum.
    if (dto.type) {
      const cfg = await this.prisma.businessTypeConfig.findUnique({
        where: { type: dto.type },
        select: { active: true },
      });
      if (cfg) {
        if (!cfg.active)
          throw new BadRequestException('Tipo de negocio no válido.');
      } else if (
        !(Object.values(BusinessType) as string[]).includes(dto.type)
      ) {
        throw new BadRequestException('Tipo de negocio no válido.');
      }
    }

    // Si viene cupón, se valida contra el plan elegido (lanza si no sirve).
    const couponCode = dto.couponCode?.trim();
    const coupon = couponCode
      ? await this.coupons.validateForPlan(couponCode, dto.plan)
      : null;

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const { company, admin } = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.companyName.trim(),
          type: dto.type ?? BusinessType.COMERCIO,
          phone: dto.phone?.trim() || null,
          manager: dto.ownerName.trim(),
          logo: dto.logo?.trim() || null,
          status: Status.ACTIVO,
          plan: dto.plan,
          startDate: new Date(),
          couponCode: coupon ? coupon.code : null,
        },
      });

      const admin = await tx.user.create({
        data: {
          name: dto.ownerName.trim(),
          email,
          password: hashedPassword,
          phone: dto.phone?.trim() || null,
          role: Role.SUPER_ADMIN,
          status: Status.ACTIVO,
          companyId: company.id,
        },
      });

      if (coupon) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { timesRedeemed: { increment: 1 } },
        });
      }

      return { company, admin };
    });

    const payload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      companyId: admin.companyId,
      localId: admin.localId,
    };

    const { password, ...safeUser } = admin;

    return {
      success: true,
      message: 'Cuenta creada correctamente',
      data: {
        access_token: await this.jwtService.signAsync(payload),
        user: {
          ...safeUser,
          company: {
            id: company.id,
            name: company.name,
            status: company.status,
            type: company.type,
          },
        },
      },
    };
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

  // Impersonación de soporte: la plataforma "entra como" el dueño (SUPER_ADMIN)
  // de una empresa para ver/configurar exactamente lo que él ve. Devuelve un
  // token de ese usuario (marcado con impersonatedBy para auditoría).
  async impersonate(companyId: number, actingUser: any) {
    if (actingUser?.role !== 'SUPER_PLATFORM_ADMIN') {
      throw new ForbiddenException('Solo la plataforma puede impersonar');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, status: true, type: true },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    if (company.status !== 'ACTIVO') {
      throw new BadRequestException(
        'La empresa está suspendida. Actívala antes de entrar como ella.',
      );
    }
    const admin = await this.prisma.user.findFirst({
      where: {
        companyId,
        role: Role.SUPER_ADMIN,
        status: { not: 'ELIMINADO' as any },
      },
      orderBy: { id: 'asc' },
    });
    if (!admin) {
      throw new NotFoundException('La empresa no tiene un administrador dueño.');
    }
    // Auditoría: deja rastro de cada acceso de soporte (no bloquea si falla).
    await this.prisma.impersonationLog
      .create({
        data: {
          companyId: company.id,
          companyName: company.name,
          actorId: actingUser.id,
          actorEmail: actingUser.email ?? null,
          targetUserId: admin.id,
        },
      })
      .catch(() => undefined);
    const payload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      companyId: admin.companyId,
      localId: admin.localId,
      impersonatedBy: actingUser.id,
    };
    const { password, ...safeUser } = admin;
    return {
      success: true,
      data: {
        access_token: await this.jwtService.signAsync(payload),
        user: { ...safeUser, company },
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
