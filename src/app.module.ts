import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
