export interface Session {
  id: string;
  title: string | null;
  message_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  created_at: number;
  updated_at: number;
  parent_session_id: string | null;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  model_id: string | null;
  created_at: number;
}

export interface Part {
  id: string;
  message_id: string;
  session_id: string;
  type: 'text' | 'tool-call' | 'tool-result' | 'reasoning' | 'file' | 'error';
  data: string;
}

export interface SessionWithMessages extends Session {
  messages: Message[];
  parts: Part[];
}

export interface SessionPreview {
  id: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  preview: string;
}

export interface PluginOptions {
  maxSessions?: number;
  dateFormat?: string;
  showPreview?: boolean;
  enableCLI?: boolean;
  backupDir?: string;
}

export interface ExportOptions {
  format: 'json' | 'markdown' | 'text';
  includeMessages: boolean;
  includeParts: boolean;
  outputPath?: string;
}

export interface BackupOptions {
  includeAll: boolean;
  sessionIds?: string[];
  compress: boolean;
}
