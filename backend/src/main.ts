import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './bootstrap';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  if (env.PROCESS_ROLE === 'worker') {
    throw new Error('PROCESS_ROLE=worker must be started with dist/worker.js');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, env);
  if (env.SWAGGER_ENABLED) setupSwagger(app);
  await app.listen(env.PORT, '0.0.0.0');
  app.get(Logger).log(`MOSHINA BOR API listening on port ${env.PORT} (role=${env.PROCESS_ROLE}, env=${env.NODE_ENV})`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
