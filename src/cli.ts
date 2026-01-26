import { NestFactory } from '@nestjs/core';
import { CommandService } from 'nestjs-command';
import { CliModule } from './cli.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(CliModule);
  await app.get(CommandService).exec();
  await app.close();
}
bootstrap();
