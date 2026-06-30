import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationLinksController } from './integration-links.controller';
import { IntegrationLinksService } from './integration-links.service';

@Module({
  imports: [PrismaModule],
  controllers: [IntegrationLinksController],
  providers: [IntegrationLinksService],
  exports: [IntegrationLinksService],
})
export class IntegrationLinksModule {}
