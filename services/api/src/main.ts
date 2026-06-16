import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { Logger } from './common/logger';
import { attachSignalServer } from './signal/signal.server';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new Logger(),
  });

  const configService = app.get(ConfigService);
  const port = configService.get('API_PORT', 3000);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  await app.listen(port);

  // Attach WebSocket signal server to the same HTTP server
  const httpServer = app.getHttpServer();
  attachSignalServer(httpServer);

  const logger = new Logger();
  logger.log(`API server running on http://localhost:${port}`, 'Bootstrap');
  logger.log(`Signal server running on ws://localhost:${port}/signal`, 'Bootstrap');
}

bootstrap();
