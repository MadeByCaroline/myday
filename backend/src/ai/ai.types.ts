import type { CalendarEvent } from '../calendar/calendar.service';
import type { EmailSummary } from '../integrations/gmail.client';

export const EMAIL_CATEGORIES = [
  'URGENT',
  'NEWSLETTER',
  'INVOICE',
  'ACTION_REQUIRED',
  'INFO',
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export interface CategorizedEmailSummary {
  emailId: string;
  summary: string;
  category: EmailCategory;
  suggestedActions: string[];
  senderName: string;
  senderEmail: string;
  subject: string;
  link: string;
}

export interface AiAnalysisResult {
  summary: string;
  events: CalendarEvent[];
  suggested_tasks: Array<{
    title: string;
    description: string;
    source: string;
  }>;
  email_summaries: CategorizedEmailSummary[];
}

export interface TimeBlock {
  taskId: string;
  suggestedStartTime: string;
  suggestedEndTime: string;
  title: string;
}

export interface TimeBlockingTaskInput {
  id: string;
  title: string;
  description?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
}

export interface WorkspaceDateRange {
  start: string;
  end: string;
}

export interface WorkspaceChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkspaceChatToolset {
  getCalendar: (dateRange: WorkspaceDateRange) => Promise<unknown>;
  getTasks: (status?: string) => Promise<unknown>;
  getTimeEntries: (
    dateRange?: WorkspaceDateRange,
    projectId?: string,
  ) => Promise<unknown>;
}

export interface MorningBriefingResult {
  greeting: string;
  emailSummary: string;
  scheduleOverview: string;
  recommendedFocus: string;
}

export interface MorningBriefingContext {
  unreadEmails: EmailSummary[];
  todayEvents: CalendarEvent[];
  highPriorityTodoTasks: Array<{
    id: string;
    title: string;
    description: string | null;
  }>;
}
