import { Module } from '@nestjs/common';
import { GmailClient } from '../integrations/gmail.client';
import { MailService } from './mail.service';

@Module({
  providers: [GmailClient, MailService],
  exports: [GmailClient, MailService],
})
export class MailModule {}
