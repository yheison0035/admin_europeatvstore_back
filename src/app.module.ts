import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InventoryModule } from './inventory/inventory.module';
import { LocalsModule } from './locals/locals.module';
import { ProvidersModule } from './providers/providers.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma.module';
import { VariantsModule } from './inventory/variants/variants.module';
import { EnumsModule } from './enums/enums.module';
import { EcommerceModule } from './ecommerce/ecommerce.module';
import { WompiModule } from './wompi/wompi.module';
import { CompaniesModule } from './companies/companies.module';
import { ServicesModule } from './services/services.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { MesasModule } from './mesas/mesas.module';
import { EmployeeChargesModule } from './employee-charges/employee-charges.module';
import { PushModule } from './push/push.module';
import { PayablesModule } from './payables/payables.module';
import { ComandasModule } from './comandas/comandas.module';
import { SuppliesModule } from './supplies/supplies.module';
import { RecipesModule } from './recipes/recipes.module';
import { BankModule } from './bank/bank.module';
import { CashModule } from './cash/cash.module';
import { PurchasesModule } from './purchases/purchases.module';
import { QuotesModule } from './quotes/quotes.module';
import { ReturnsModule } from './returns/returns.module';
import { WebsiteModule } from './modules/website/website.module';
import { StatisticsModule } from './statistics/statistics.module';
import { ElectronicInvoicingModule } from './electronic-invoicing/electronic-invoicing.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { ChargeCategoriesModule } from './charge-categories/charge-categories.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { UnitsOfMeasureModule } from './units-of-measure/units-of-measure.module';
import { CustomerSegmentsModule } from './customer-segments/customer-segments.module';
import { RestDaysModule } from './rest-days/rest-days.module';
import { AuditModule } from './audit/audit.module';
import { CouponsModule } from './coupons/coupons.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Rate-limiting global: máx. 100 peticiones por minuto por IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    BrandsModule,
    CategoriesModule,
    CustomersModule,
    ExpensesModule,
    InventoryModule,
    LocalsModule,
    ProvidersModule,
    SalesModule,
    UsersModule,
    VariantsModule,
    EnumsModule,
    EcommerceModule,
    WompiModule,
    CompaniesModule,
    ServicesModule,
    AppointmentsModule,
    MesasModule,
    EmployeeChargesModule,
    PushModule,
    PayablesModule,
    ComandasModule,
    SuppliesModule,
    RecipesModule,
    BankModule,
    CashModule,
    PurchasesModule,
    QuotesModule,
    ReturnsModule,
    WebsiteModule,
    StatisticsModule,
    ElectronicInvoicingModule,
    ExpenseCategoriesModule,
    ChargeCategoriesModule,
    PaymentMethodsModule,
    UnitsOfMeasureModule,
    CustomerSegmentsModule,
    RestDaysModule,
    AuditModule,
    CouponsModule,
    SubscriptionModule,
  ],
  providers: [
    // Aplica el rate-limiting a todas las rutas
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
