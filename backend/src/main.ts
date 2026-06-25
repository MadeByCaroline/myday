import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const frontendUrl = configService.get<string>('FRONTEND_URL') || 'http://127.0.0.1:5173';
  const allowedOrigins = new Set([frontendUrl]);
  try {
    const parsed = new URL(frontendUrl);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
    } else if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
    }
    allowedOrigins.add(parsed.toString().replace(/\/$/, ''));
  } catch {
    // frontendUrl is not a valid URL; allow only the configured value
  }
  app.enableCors({
    origin: Array.from(allowedOrigins),
    credentials: true,
  });

  const port = Number(configService.get<string>('PORT') || '3000');
  await app.listen(port, '0.0.0.0');
  console.log(`Backend running on http://127.0.0.1:${port}`);
}

void bootstrap();
