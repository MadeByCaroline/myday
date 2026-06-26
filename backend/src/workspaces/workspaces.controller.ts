import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async getWorkspaces(@Req() req: any) {
    return this.workspacesService.listWorkspaces(req.user.id);
  }

  @Post()
  async createWorkspace(
    @Req() req: any,
    @Body() body: { name: string; color?: string; icon?: string },
  ) {
    return this.workspacesService.createWorkspace(req.user.id, body);
  }

  @Patch(':id')
  async updateWorkspace(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; color?: string; icon?: string },
  ) {
    return this.workspacesService.updateWorkspace(id, req.user.id, body);
  }

  @Delete(':id')
  async deleteWorkspace(@Req() req: any, @Param('id') id: string) {
    return this.workspacesService.deleteWorkspace(id, req.user.id);
  }
}
