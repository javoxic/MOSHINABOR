import { VersioningType, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation.pipe';

/** Shared HTTP configuration (used by main.ts and the e2e tests). */
export function configureApp(app: NestExpressApplication, env: Env): INestApplication {
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: env.SWAGGER_ENABLED ? false : undefined,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '256kb' });
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Requested-With', 'Accept-Language'],
    maxAge: 600,
  });
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('MOSHINA BOR API')
    .setDescription(
      'REST API for the MOSHINA BOR mobile app and admin dashboard. Mobile endpoints use a bearer access token from /v1/auth/otp/verify; admin endpoints (/v1/admin/*) use an admin bearer token from /v1/admin/auth/login. Money values are UZS decimal strings; calendar dates are YYYY-MM-DD in Asia/Tashkent.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/openapi.json' });
}
