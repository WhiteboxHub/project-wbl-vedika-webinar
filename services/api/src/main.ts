import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { Logger } from './common/logger';
import { runMigrationsOnStartup } from './database/run-migrations';
import * as os from 'os';

function detectLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new Logger(),
  });

  const configService = app.get(ConfigService);
  const port = configService.get('API_PORT', 3000);

  // Run SQL migrations before accepting traffic.
  // Uses a dollar-quote-aware parser so PL/pgSQL functions are handled correctly.
  const databaseUrl = configService.get<string>('DATABASE_URL', '');
  if (databaseUrl) {
    await runMigrationsOnStartup(databaseUrl);
  }

  // Enable WebSocket adapter (ws — matches the client's native WebSocket)
  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: true, credentials: true });

  await app.listen(port);

  const logger = new Logger();
  const lanIp = detectLanIp();
  const clientPort = 5173;

  logger.log('', 'Bootstrap');
  logger.log('╔══════════════════════════════════════════════════╗', 'Bootstrap');
  logger.log('║  Vedika Webinar Platform - API Server            ║', 'Bootstrap');
  logger.log(`║  API:     http://${lanIp}:${port}                 `, 'Bootstrap');
  logger.log(`║  Client:  http://${lanIp}:${clientPort}               `, 'Bootstrap');
  logger.log(`║  Signal:  ws://${lanIp}:${port}/signal            `, 'Bootstrap');
  logger.log(`║  Share:   http://${lanIp}:${clientPort}/w/{slug}     `, 'Bootstrap');
  logger.log('╚══════════════════════════════════════════════════╝', 'Bootstrap');
}

bootstrap();
