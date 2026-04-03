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
    return this.mapEnumToOptions(Role);
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
