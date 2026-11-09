/**
 * Writes the OpenAPI document to docs/openapi.json (requires DATABASE_URL/REDIS_URL reachable,
 * because the application context is initialized exactly as in production).
 *   pnpm --filter @moshina/backend run openapi
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { configureApp } from '../bootstrap';
import { loadEnv } from '../config/env';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env, { withJobs: false, withHttp: true }), { logger: ['error'] });
  configureApp(app, env);
  await app.init();
  const config = new DocumentBuilder().setTitle('MOSHINA BOR API').setVersion('1.0.0').addBearerAuth().build();
  const doc = SwaggerModule.createDocument(app, config);
  const out = join(__dirname, '..', '..', '..', 'docs', 'openapi.json');
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`OpenAPI written to ${out} (${Object.keys(doc.paths).length} paths)`);
  await app.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
