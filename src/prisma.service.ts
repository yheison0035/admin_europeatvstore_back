import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({
      // Nunca exponer el hash de contraseña del cliente en ninguna consulta.
      // Para leerlo (login) hay que pedirlo explícitamente con `omit` o `select`.
      omit: {
        customer: { password: true },
      },
    });
  }
}
