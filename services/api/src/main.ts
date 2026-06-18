import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { Logger } from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new Logger(),
  });

  const configService = app.get(ConfigService);
  const port = configService.get('API_PORT', 3000);

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
  logger.log(`API server running on http://localhost:${port}`, 'Bootstrap');
  logger.log(`Signal WebSocket: ws://localhost:${port}/signal`, 'Bootstrap');
}

bootstrap();
