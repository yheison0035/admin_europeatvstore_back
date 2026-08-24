import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import helmet from 'helmet';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createCorsOriginChecker } from './common/cors-origin.util';
import { PrismaService } from './prisma.service';

type CorsCallback = (err: Error | null, allow?: boolean) => void;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProd = process.env.NODE_ENV === 'production';

  // Cabeceras de seguridad HTTP
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina campos que no estén en el DTO (protege la BD)
      // No reventamos si llegan campos extra: los editores del panel reenvían la
      // entidad completa (id, companyId, fechas, relaciones…) y whitelist ya los
      // descarta antes de tocar la BD. Así no hay errores "property X should not
      // exist" en ningún módulo. Los tipos/formatos sí se siguen validando.
      forbidNonWhitelisted: false,
      transform: true, // transforma los tipos (ej: "123" → number si espera number)
    }),
  );

  app.use('/public', express.static(join(process.cwd(), 'public')));

  // CORS: orígenes de Pegazo siempre permitidos, los que se agreguen por env
  // (CORS_ORIGINS, separados por coma) y —dinámicamente— el dominio de cada
  // empresa con sitio web activo, porque cada tienda vive en su propio dominio.
  const envOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaultOrigins = [
    'https://pegazo.co',
    'https://www.pegazo.co',
    'http://localhost:3000',
  ];

  const isOriginAllowed = createCorsOriginChecker(app.get(PrismaService), {
    staticOrigins: [...new Set([...defaultOrigins, ...envOrigins])],
    allowLocalhost: !isProd,
  });

  app.enableCors({
    origin: (origin: string | undefined, callback: CorsCallback) => {
      // Sin Origin: curl, Postman, SSR o apps móviles (no son peticiones de navegador).
      if (!origin) return callback(null, true);

      isOriginAllowed(origin)
        .then((allowed) => callback(null, allowed))
        .catch(() => callback(null, false));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // X-Website-Domain lo envía la tienda para identificar de qué empresa es.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Website-Domain'],
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
