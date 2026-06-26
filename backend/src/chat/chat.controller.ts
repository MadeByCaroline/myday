import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

interface ChatRequest {
  user: {
    id: string;
  };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  async sendMessage(@Req() req: ChatRequest, @Body() body: { prompt: string }) {
    return this.chatService.sendMessage(req.user.id, body.prompt || '');
  }
}
