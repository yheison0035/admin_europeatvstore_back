import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({
      // Nunca exponer secretos en las consultas por defecto: el hash de
      // contraseña del cliente ni la contraseña SMTP de la empresa. Para leerlos
      // hay que pedirlos explícitamente con `omit: { ...: false }`.
      omit: {
        customer: { password: true },
        company: { mailPassword: true },
      },
    });
  }
}
