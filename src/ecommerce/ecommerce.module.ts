import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EcommerceService } from './ecommerce.service';
import { EcommerceController } from './ecommerce.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerJwtGuard } from '@/common/guards/customer-jwt.guard';
import { MailService } from '@/mail/mail.service';
import { PrismaService } from '@/prisma.service';
import { WebsiteModule } from '@/modules/website/website.module';

@Module({
  imports: [
    WebsiteModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET no está definido');
        }
        return { secret };
      },
    }),
  ],
  controllers: [EcommerceController],
  providers: [
    EcommerceService,
    CustomerAuthService,
    CustomerJwtGuard,
    MailService,
    PrismaService,
  ],
})
export class EcommerceModule {}
