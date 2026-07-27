import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { WebsiteModule } from './modules/website/website.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    WebsiteModule,
  ],
  providers: [
    // Aplica el rate-limiting a todas las rutas
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
