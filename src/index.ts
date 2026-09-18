import { tool } from "@opencode-ai/plugin";
import * as fs from 'fs';
import * as path from 'path';
import { OpenCodeDB } from './db.js';
import { PluginOptions, ExportOptions, BackupOptions } from './types.js';
import { i18n } from './i18n.js';

export const SessionPickerPlugin = async (ctx: any) => {
  const options: PluginOptions = ctx.options || {};
  const db = new OpenCodeDB();

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString(i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return {
    tool: {
      session_list: tool({
        description: i18n.t('tools.sessionListDesc'),
        args: {
          limit: tool.schema.number().optional().describe(i18n.t('tools.limitParam')),
          search: tool.schema.string().optional().describe(i18n.t('tools.searchParam')),
        },
        async execute(args: any, context: any) {
          const limit = args.limit || options.maxSessions || 20;
          const search = args.search;

          if (!db.connect()) {
            return i18n.t('errors.databaseConnectionFailed');
          }

          try {
            const sessions = search 
              ? db.searchSessions(search)
              : db.listSessions(limit);

            if (sessions.length === 0) {
              return i18n.t('prompts.noSessionsFound');
            }

            const formatted = sessions.slice(0, limit).map((s: any, i: number) => {
              const title = s.title || i18n.t('session.untitled');
              const date = formatDate(s.time_updated);
              return `[${i + 1}] ${title} (${s.message_count || 0} ${i18n.t('session.messageCount').toLowerCase()}, ${date}) ID: ${s.id}`;
            });

            return i18n.t('results.foundSessions', { count: String(sessions.length) }) + ':\n\n' + formatted.join('\n');
          } finally {
            db.disconnect();
          }
        },
      }),

      session_search: tool({
        description: i18n.t('tools.sessionSearchDesc'),
        args: {
          query: tool.schema.string().describe(i18n.t('tools.searchParam')),
          session_id: tool.schema.string().optional().describe(i18n.t('tools.sessionIdParam')),
        },
        async execute(args: any) {
          const { query, session_id } = args;

          if (!db.connect()) {
            return i18n.t('errors.databaseConnectionFailed');
          }

          try {
            if (session_id) {
              const messages = db.getSessionMessages(session_id);
              const matchingMessages = messages.filter((m: any) => {
                const parts = db.getMessageParts(m.id);
                return parts.some((p: any) => p.data.includes(query));
              });

              if (matchingMessages.length === 0) {
                return i18n.getLanguage() === 'zh' 
                  ? `在会话 ${session_id} 中没有找到匹配 "${query}" 的内容`
                  : `No matching content found in session ${session_id} for "${query}"`;
              }

              return i18n.getLanguage() === 'zh'
                ? `在会话中找到 ${matchingMessages.length} 条匹配消息`
                : `Found ${matchingMessages.length} matching messages in session`;
            }

            const sessions = db.searchSessions(query);
            if (sessions.length === 0) {
              return i18n.getLanguage() === 'zh'
                ? `没有找到包含 "${query}" 的会话`
                : `No sessions found containing "${query}"`;
            }

            const formatted = sessions.map((s: any, i: number) => {
              const title = s.title || i18n.t('session.untitled');
              const date = formatDate(s.time_updated);
              return `[${i + 1}] ${title} (${date}) ID: ${s.id}`;
            });

            return i18n.t('results.foundSessions', { count: String(sessions.length) }) + ':\n\n' + formatted.join('\n');
          } finally {
            db.disconnect();
          }
        },
      }),

      session_switch: tool({
        description: i18n.t('tools.sessionSwitchDesc'),
        args: {
          session_id: tool.schema.string().describe(i18n.t('tools.sessionIdParam')),
          fork: tool.schema.boolean().optional().describe(i18n.t('tools.forkParam')),
        },
        async execute(args: any, context: any) {
          const { session_id, fork } = args;

          if (!db.connect()) {
            return i18n.t('errors.databaseConnectionFailed');
          }

          try {
            const session = db.getSession(session_id);
            if (!session) {
              return i18n.t('errors.sessionNotExist', { id: session_id });
            }

            const title = session.title || i18n.t('session.untitled');
            const command = fork 
              ? `opencode --session ${session_id} --fork`
              : `opencode --session ${session_id}`;

            return i18n.getLanguage() === 'zh'
              ? `已切换到会话 "${title}"\n\n请在终端中运行以下命令继续会话:\n${command}`
              : `Switched to session "${title}"\n\nRun the following command in terminal to continue:\n${command}`;
          } finally {
            db.disconnect();
          }
        },
      }),

      session_info: tool({
        description: i18n.t('tools.sessionInfoDesc'),
        args: {
          session_id: tool.schema.string().describe(i18n.t('tools.sessionIdParam')),
        },
        async execute(args: any) {
          const { session_id } = args;

          if (!db.connect()) {
            return i18n.t('errors.databaseConnectionFailed');
          }

          try {
            const session = db.getSession(session_id);
            if (!session) {
              return i18n.t('errors.sessionNotExist', { id: session_id });
            }

            const messages = db.getSessionMessages(session_id);
            const lastMessage = messages[messages.length - 1];
            let lastMessagePreview = '';

            if (lastMessage) {
              const parts = db.getMessageParts(lastMessage.id);
              const textParts = parts.filter((p: any) => p.type === 'text');
              if (textParts.length > 0) {
                try {
                  const data = JSON.parse(textParts[0].data);
                  lastMessagePreview = (data.text || '').substring(0, 200);
                } catch {
                  lastMessagePreview = textParts[0].data?.substring(0, 200) || '';
                }
              }
            }

            return [
              `${i18n.getLanguage() === 'zh' ? '会话详情' : 'Session Details'}:`,
              `- ${i18n.t('session.id')}: ${session.id}`,
              `- ${i18n.t('session.title')}: ${session.title || i18n.t('session.untitled')}`,
              `- ${i18n.t('session.messageCount')}: ${session.message_count || messages.length}`,
              `- ${i18n.t('session.tokensInput')}: ${session.tokens_input || 0}`,
              `- ${i18n.t('session.tokensOutput')}: ${session.tokens_output || 0}`,
              `- ${i18n.t('session.createdAt')}: ${formatDate(session.time_created)}`,
              `- ${i18n.t('session.updatedAt')}: ${formatDate(session.time_updated)}`,
              lastMessagePreview ? `\n${i18n.getLanguage() === 'zh' ? '最后消息预览' : 'Last message preview'}:\n${lastMessagePreview}...` : '',
            ].filter(Boolean).join('\n');
          } finally {
            db.disconnect();
          }
        },
      }),

      session_export: tool({
        description: i18n.t('tools.sessionExportDesc'),
        args: {
          session_id: tool.schema.string().describe(i18n.t('tools.sessionIdParam')),
          output_path: tool.schema.string().optional().describe(i18n.t('tools.outputPathParam')),
        },
        async execute(args: any) {
          const { session_id, output_path } = args;

          if (!db.connect()) {
            return i18n.t('errors.databaseConnectionFailed');
          }

          try {
            const exportData = db.exportSession(session_id);
            if (!exportData) {
              return i18n.t('errors.exportFailed');
            }

            const filename = `session-${session_id.substring(0, 8)}-${Date.now()}.json`;
            const outputPath = output_path 
              ? path.join(output_path, filename)
              : path.join(process.cwd(), filename);

            fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
            return i18n.t('results.exportSuccess', { path: outputPath });
          } finally {
            db.disconnect();
          }
        },
      }),

      session_backup: tool({
        description: i18n.t('tools.sessionBackupDesc'),
        args: {
          session_ids: tool.schema.string().optional().describe(i18n.getLanguage() === 'zh' ? '要备份的会话 ID，多个用逗号分隔' : 'Session IDs to backup, comma separated'),
          all: tool.schema.boolean().optional().describe(i18n.t('tools.allParam')),
          output_path: tool.schema.string().optional().describe(i18n.t('tools.outputPathParam')),
        },
        async execute(args: any) {
          const { session_ids, all, output_path } = args;

          if (!db.connect()) {
            return i18n.t('errors.databaseConnectionFailed');
          }

          try {
            const backupDir = output_path || path.join(process.cwd(), 'opencode-backups');
            if (!fs.existsSync(backupDir)) {
              fs.mkdirSync(backupDir, { recursive: true });
            }

            let sessions;
            if (all) {
              sessions = db.listSessions();
            } else if (session_ids) {
              const ids = session_ids.split(',').map((id: string) => id.trim());
              sessions = ids.map((id: string) => db.getSession(id)).filter(Boolean);
            } else {
              return i18n.getLanguage() === 'zh'
                ? '请指定要备份的会话 ID 或使用 --all 参数'
                : 'Please specify session IDs or use --all flag';
            }

            if (sessions.length === 0) {
              return i18n.getLanguage() === 'zh' ? '没有找到要备份的会话' : 'No sessions found to backup';
            }

            const backupFile = path.join(backupDir, `backup-${Date.now()}.json`);
            const backupData = {
              createdAt: new Date().toISOString(),
              sessions: sessions.map((s: any) => db.exportSession(s!.id)).filter(Boolean),
            };

            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
            return i18n.t('results.backupSuccess', { path: backupFile, count: String(backupData.sessions.length) });
          } finally {
            db.disconnect();
          }
        },
      }),
    },

    event: async (eventData: any) => {
      // 监听会话事件（可扩展）
      if (eventData.event?.type === 'session.created') {
        ctx.client.app.log({
          body: {
            service: 'session-picker',
            level: 'info',
            message: `${i18n.getLanguage() === 'zh' ? '新会话创建' : 'New session created'}: ${eventData.event.properties?.id}`,
          },
        });
      }
    },
  };
};

export default SessionPickerPlugin;
