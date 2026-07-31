import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import helmet from 'helmet';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProd = process.env.NODE_ENV === 'production';

  // Cabeceras de seguridad HTTP
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina campos que no estén en el DTO
      forbidNonWhitelisted: true, // lanza error si envías campos extra
      transform: true, // transforma los tipos (ej: "123" → number si espera number)
    }),
  );

  app.use('/public', express.static(join(process.cwd(), 'public')));

  // CORS: orígenes de Pegazo siempre permitidos + los que se agreguen por env
  // (CORS_ORIGINS, separados por coma) para futuros dominios.
  const envOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaultOrigins = [
    'https://pegazo.co',
    'https://www.pegazo.co',
    'http://localhost:3000',
  ];

  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger solo fuera de producción
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('API_PEGAZO')
      .setDescription('Documentación y pruebas de la API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document); // http://localhost:3002/api-docs
  }

  await app.listen(process.env.PORT || 3002);
}
bootstrap();
