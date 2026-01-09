import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Este es el guard que protege rutas
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
