import { Injectable } from '@nestjs/common';
import {
  Role,
  Status,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  ExpenseType,
  BusinessType,
} from '@prisma/client';
import { PrismaService } from '@/prisma.service';

@Injectable()
export class EnumsService {
  constructor(private prisma: PrismaService) {}

  private mapEnumToOptions(enumObj: object) {
    return Object.values(enumObj).map((value) => ({
      id: value,
      name: value.replace(/_/g, ' '),
    }));
  }

  getRoles() {
    // Roles NO asignables desde el formulario de usuarios:
    // - SUPER_PLATFORM_ADMIN: rol de plataforma, solo existe uno (el dueño).
    // - SUPER_ADMIN: administrador principal, se crea automáticamente con la
    //   empresa y solo puede haber uno por empresa.
    const noAsignables: Role[] = [
      Role.SUPER_PLATFORM_ADMIN,
      Role.SUPER_ADMIN,
    ];
    return this.mapEnumToOptions(Role).filter(
      (r) => !noAsignables.includes(r.id as Role),
    );
  }

  getStatus() {
    return this.mapEnumToOptions(Status);
  }

  getPaymentMethods() {
    return this.mapEnumToOptions(PaymentMethod);
  }

  getPaymentStatus() {
    return this.mapEnumToOptions(PaymentStatus);
  }

  getSaleStatus() {
    return this.mapEnumToOptions(SaleStatus);
  }

  getTypeExpenses() {
    return this.mapEnumToOptions(ExpenseType);
  }

  // Tipos de negocio para los selects: los configurados y ACTIVOS en BD
  // (incluye los creados por la plataforma), con respaldo a los 17 base del enum
  // por si aún no se ha sembrado la tabla.
  async getTypeCompanies() {
    const configs = await this.prisma.businessTypeConfig.findMany({
      where: { active: true },
      select: { type: true, label: true },
      orderBy: { label: 'asc' },
    });
    const map = new Map(configs.map((c) => [c.type, c.label]));
    // Respaldo: asegura que los base siempre aparezcan aunque falte su fila.
    for (const t of Object.values(BusinessType)) {
      if (!map.has(t)) map.set(t, (t as string).replace(/_/g, ' '));
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }
}
