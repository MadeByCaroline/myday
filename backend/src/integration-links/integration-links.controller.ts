import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateIntegrationLinkDto,
  IntegrationLinksService,
} from './integration-links.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@Controller('integration-links')
@UseGuards(JwtAuthGuard)
export class IntegrationLinksController {
  constructor(
    private readonly integrationLinksService: IntegrationLinksService,
  ) {}

  @Get()
  listLinks(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
  ) {
    return this.integrationLinksService.listLinks(req.user.id, type);
  }

  @Post()
  createLink(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateIntegrationLinkDto,
  ) {
    return this.integrationLinksService.createLink(req.user.id, body);
  }

  @Delete(':id')
  deleteLink(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrationLinksService.deleteLink(id, req.user.id);
  }
}
