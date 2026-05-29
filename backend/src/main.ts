import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma.service';
import helmet from 'helmet';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter({ bodyLimit: 10 * 1024 * 1024 });

  fastifyAdapter.getInstance().addContentTypeParser(
    ['text/xml', 'application/xml', 'application/soap+xml'],
    { parseAs: 'string' },
    function (req, body, done) {
      done(null, body);
    }
  );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('TR-069 ACS API')
    .setDescription('Auto Configuration Server for CPE Management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const port = process.env.APP_PORT || 3000;
  const host = process.env.APP_HOST || '0.0.0.0';

  await app.listen(port, host);
  console.log(`🚀 TR-069 ACS running on http://${host}:${port}`);
  console.log(`📚 API Docs: http://${host}:${port}/api/docs`);
}

bootstrap();
