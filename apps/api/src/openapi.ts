import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { buildOpenApi } from './main';

/** Exporte la spec OpenAPI (openapi.json) pour générer le client Dart de l'app Flutter. */
async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1');
  const doc = buildOpenApi(app);
  const out = join(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`Spec OpenAPI écrite : ${out} (${Object.keys(doc.paths).length} routes)`);
  await app.close();
}

run();
