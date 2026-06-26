export interface UnifiedEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  provider: 'GOOGLE' | 'MICROSOFT';
  location?: string;
  link?: string;
}
