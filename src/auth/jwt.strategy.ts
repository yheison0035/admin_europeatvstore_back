import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // Configura Passport para extraer token de Authorization: Bearer <token>.
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET no está definido en las variables de entorno. Configúralo antes de arrancar.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // En validate, construye el objeto req.user que viajará en todas las peticiones protegidas.
  async validate(payload: any) {
    // Suspensión por impago: se revalida el estado de la empresa en CADA
    // petición, así al desactivarla se cortan también las sesiones ya abiertas
    // (no hay que esperar a que expire el token). El SUPER_PLATFORM_ADMIN es
    // de plataforma y no depende de ninguna empresa.
    if (payload.role !== 'SUPER_PLATFORM_ADMIN' && payload.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: payload.companyId },
        select: { status: true },
      });

      if (!company || company.status !== 'ACTIVO') {
        throw new UnauthorizedException('Tu empresa está suspendida.');
      }
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      companyId: payload.companyId,
      localId: payload.localId,
    };
  }
}
