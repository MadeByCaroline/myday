import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService, UserSettings } from './settings.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(@Req() req: AuthenticatedRequest): Promise<UserSettings> {
    return this.settingsService.getSettings(req.user.id);
  }

  @Put()
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: Partial<UserSettings>,
  ): Promise<UserSettings> {
    return this.settingsService.updateSettings(req.user.id, body);
  }
}
