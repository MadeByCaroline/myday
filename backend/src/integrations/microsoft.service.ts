import { Injectable, Logger } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import type { EmailSummary } from '../mail/mail.service';

interface MicrosoftMessageResponse {
  value?: Array<{
    bodyPreview?: string;
    from?: {
      emailAddress?: {
        address?: string;
      };
    };
    receivedDateTime?: string;
    subject?: string;
  }>;
}

@Injectable()
export class MicrosoftService {
  private readonly logger = new Logger(MicrosoftService.name);

  async getUnreadEmails(accessToken: string): Promise<EmailSummary[]> {
    this.logger.log('Fetching Microsoft emails...');
    try {
      const response = await axios.get<MicrosoftMessageResponse>(
        'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages',
        {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
          params: {
            $filter: 'isRead eq false',
            $top: 15,
          },
        },
      );

      this.logger.log(
        `Microsoft returned ${response.data.value?.length || 0} emails.`,
      );

      return (response.data.value || []).map((message) => ({
        from: message.from?.emailAddress?.address || '',
        subject: message.subject || '(no subject)',
        snippet: message.bodyPreview || '',
        receivedAt: message.receivedDateTime || '',
      }));
    } catch (error) {
      const detail = isAxiosError(error)
        ? (error.response?.data ?? error.message)
        : error instanceof Error
          ? error.message
          : 'Unknown Microsoft Graph API error';
      this.logger.error('Microsoft Graph Error:', detail);
      return [];
    }
  }
}
