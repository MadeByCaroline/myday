import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { EmailSummary } from '../mail/mail.service';

interface GraphMailMessage {
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
}

interface GraphMailResponse {
  value?: GraphMailMessage[];
}

@Injectable()
export class MicrosoftService {
  private readonly logger = new Logger(MicrosoftService.name);
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';

  async getUnreadEmails(accessToken: string): Promise<EmailSummary[]> {
    try {
      const url = `${this.graphBaseUrl}/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=15`;
      const response = await axios.get<GraphMailResponse>(url, {
        headers: { Authorization: 'Bearer ' + accessToken },
      });

      const messages = response.data.value ?? [];
      return messages.map((msg) => ({
        from:
          msg.from?.emailAddress?.name ||
          msg.from?.emailAddress?.address ||
          '',
        subject: msg.subject || '(no subject)',
        snippet: msg.bodyPreview || '',
        receivedAt: msg.receivedDateTime || '',
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Graph API error';
      this.logger.error('Failed to fetch Outlook emails', message);
      return [];
    }
  }
}
