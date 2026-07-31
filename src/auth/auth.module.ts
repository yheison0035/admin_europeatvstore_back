import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '@/users/users.module';
import { MailService } from '@/mail/mail.service';
import { WhatsappService } from '@/mail/whatsapp.service';
import { CouponsModule } from '@/coupons/coupons.module';

@Module({
  imports: [
    CouponsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET no está definido en las variables de entorno. Configúralo antes de arrancar.',
          );
        }
        return {
          secret,
          signOptions: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '1d') as any,
          },
        };
      },
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MailService, WhatsappService],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
