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

@Injectable()
export class EnumsService {
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

  getTypeCompanies() {
    return this.mapEnumToOptions(BusinessType);
  }
}
