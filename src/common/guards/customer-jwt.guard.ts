import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Valida el JWT de un CLIENTE de la tienda online (kind === 'customer'),
// separado del token del staff. Pone req.customer = { id, companyId, email }.
// Debe usarse junto con WebsiteGuard: exige que el cliente pertenezca a la
// empresa dueña del dominio.
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization || '';
    const [type, token] = header.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Sesión de cliente requerida.');
    }

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    if (payload?.kind !== 'customer' || !payload?.sub) {
      throw new UnauthorizedException('Sesión de cliente inválida.');
    }

    // Si hay contexto de sitio, el cliente debe ser de esa misma empresa.
    const website = req.website;
    if (website && Number(payload.companyId) !== Number(website.companyId)) {
      throw new UnauthorizedException('La sesión no corresponde a este sitio.');
    }

    req.customer = {
      id: Number(payload.sub),
      companyId: Number(payload.companyId),
      email: payload.email,
    };

    return true;
  }
}
