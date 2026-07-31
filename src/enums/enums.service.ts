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
    // SUPER_PLATFORM_ADMIN es un rol de plataforma; nunca debe poder asignarse
    // a un usuario de empresa desde el formulario de usuarios.
    return this.mapEnumToOptions(Role).filter(
      (r) => r.id !== Role.SUPER_PLATFORM_ADMIN,
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
