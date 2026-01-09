import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina campos que no estén en el DTO
      forbidNonWhitelisted: true, // lanza error si envías campos extra
      transform: true, // transforma los tipos (ej: "123" → number si espera number)
    }),
  );

  app.use('/public', express.static(join(process.cwd(), 'public')));

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('API_MotorentingSAS')
    .setDescription('Documentación y pruebas de la API')
    .setVersion('1.0')
    .addBearerAuth() // si quieres probar con JWT
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document); // Ruta => http://localhost:3000/api-docs

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [
        'http://localhost:3000',
        'https://crm-motorenting.vercel.app',
        'https://crm-motorenting-mocha.vercel.app',
        'https://motorentingsasfrontend-production.up.railway.app',
        'https://crm.motorentingsas.com',
        'https://motorentingsasbackend-staging.up.railway.app',
      ];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  await app.listen(process.env.PORT || 3002);
}
bootstrap();
