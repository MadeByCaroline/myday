import {
  BadRequestException,
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
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async getTasks(@Req() req: any) {
    return this.tasksService.getUserTasks(req.user.id);
  }

  @Post()
  async createTask(
    @Req() req: any,
    @Body()
    body: {
      title: string;
      description?: string;
      source?: string;
      workspaceId?: string | null;
    },
  ) {
    return this.tasksService.createTask(req.user.id, body);
  }

  @Post('bulk-update')
  async bulkUpdateTasks(
    @Req() req: any,
    @Body() body: { taskIds: string[]; status: string },
  ) {
    if (!Array.isArray(body.taskIds) || body.taskIds.length === 0) {
      throw new BadRequestException('taskIds must be a non-empty array');
    }
    if (typeof body.status !== 'string' || !body.status) {
      throw new BadRequestException('status is required');
    }
    return this.tasksService.bulkUpdateTasks(
      req.user.id,
      body.taskIds,
      body.status,
    );
  }

  @Patch(':id')
  async updateTask(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status?: string; title?: string },
  ) {
    return this.tasksService.updateTask(id, req.user.id, body);
  }

  @Delete(':id')
  async deleteTask(@Req() req: any, @Param('id') id: string) {
    return this.tasksService.deleteTask(id, req.user.id);
  }
}
