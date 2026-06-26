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
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  async getTasks(@Req() req: any) {
    return this.tasksService.getUserTasks(req.user.id);
  }

  @Post()
  async createTask(
    @Req() req: any,
    @Body() body: { title: string; description?: string; source?: string },
  ) {
    return this.tasksService.createTask(req.user.id, body);
  }

  @Patch(':id')
  async updateTask(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { isCompleted?: boolean; title?: string; status?: string },
  ) {
    return this.tasksService.updateTask(id, req.user.id, body);
  }

  @Delete(':id')
  async deleteTask(@Req() req: any, @Param('id') id: string) {
    return this.tasksService.deleteTask(id, req.user.id);
  }
}
