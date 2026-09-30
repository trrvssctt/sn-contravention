import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SEN Contraventions API')
    .setDescription(
      [
        'Backend unique de l’Admin Web, de l’App Officier et de l’Espace Usager.',
        '',
        '**Authentification** : `Authorization: Bearer <accessToken>` (15 min), renouvelé via `POST /v1/auth/refresh`.',
        '**Officier suspendu** : toute requête renvoie HTTP 423 `OFFICER_SUSPENDED` → verrouiller le terminal.',
        '**Temps réel** : Socket.IO, namespace `/ws`, `auth: { token }`. Événements : `contravention.created`, ',
        '`payment.confirmed`, `infraction_types.updated`, `vehicle.flagged`, `notification.created`, `officer.suspended`.',
        '**Hors-ligne** : envoyer `clientUuid` (UUID v4) dans `POST /v1/contraventions` pour une synchronisation idempotente.',
        '**Montants** : entiers en FCFA. **Dates** : ISO 8601.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('/')
    .build();
  return SwaggerModule.createDocument(app, config);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('v1', { exclude: ['uploads/(.*)'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, stopAtFirstError: true }));
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','), credentials: true });
  SwaggerModule.setup('docs', app, buildOpenApi(app), { jsonDocumentUrl: 'docs/openapi.json' });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`API prête : http://localhost:${port}/v1 · Swagger : http://localhost:${port}/docs`);
}

if (require.main === module) bootstrap();
