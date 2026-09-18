#!/usr/bin/env node

import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { OpenCodeDB } from './db.js';
import { SessionPreview, ExportOptions, BackupOptions } from './types.js';
import { i18n, Language } from './i18n.js';

const db = new OpenCodeDB();

function formatDate(date: Date): string {
  return date.toLocaleString(i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSession(session: SessionPreview, index: number): string {
  const preview = session.preview ? ` - ${session.preview.substring(0, 50)}...` : '';
  return `[${index + 1}] ${session.title} (${session.messageCount} ${i18n.t('session.messageCount').toLowerCase()}, ${formatDate(session.updatedAt)})${preview}`;
}

async function selectLanguage(): Promise<void> {
  const { language } = await inquirer.prompt([
    {
      type: 'list',
      name: 'language',
      message: 'Select language / 选择语言:',
      choices: [
        { name: '中文 (Chinese)', value: 'zh' },
        { name: 'English', value: 'en' },
      ],
    },
  ]);

  i18n.saveLanguage(language as Language);
  console.log(`\n${language === 'zh' ? '已选择中文' : 'Language set to English'}\n`);
}

async function listSessions(): Promise<void> {
  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    process.exit(1);
  }

  try {
    const sessions = db.getSessionsWithPreview(20);

    if (sessions.length === 0) {
      console.log(i18n.t('prompts.noSessionsFound'));
      return;
    }

    console.log(`\n=== ${i18n.t('results.sessionList')} ===\n`);
    sessions.forEach((session, index) => {
      console.log(formatSession(session, index));
    });
    console.log(`\n${i18n.getLanguage() === 'zh' ? '使用 "ocsm select" 交互式选择会话' : 'Use "ocsm select" for interactive selection'}`);
  } finally {
    db.disconnect();
  }
}

async function selectSession(): Promise<void> {
  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    process.exit(1);
  }

  try {
    const sessions = db.getSessionsWithPreview(50);

    if (sessions.length === 0) {
      console.log(i18n.t('prompts.noSessionsFound'));
      return;
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: i18n.t('prompts.selectAction'),
        choices: [
          { name: i18n.getLanguage() === 'zh' ? '选择会话继续' : 'Select session to resume', value: 'select' },
          { name: i18n.getLanguage() === 'zh' ? '搜索会话' : 'Search sessions', value: 'search' },
          { name: i18n.getLanguage() === 'zh' ? '导出会话' : 'Export session', value: 'export' },
          { name: i18n.t('cli.exit'), value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') {
      return;
    }

    if (action === 'search') {
      const { query } = await inquirer.prompt([
        {
          type: 'input',
          name: 'query',
          message: i18n.t('prompts.searchQuery'),
        },
      ]);

      const results = db.searchSessions(query);
      if (results.length === 0) {
        console.log(i18n.t('prompts.noResultsFound'));
        return;
      }

      const { selectedId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedId',
          message: i18n.t('prompts.selectSession'),
          choices: results.map(s => ({
            name: `${s.title || i18n.t('session.untitled')} (${formatDate(new Date(s.time_updated * 1000))})`,
            value: s.id,
          })),
        },
      ]);

      await launchSession(selectedId);
      return;
    }

    if (action === 'export') {
      const { selectedId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedId',
          message: i18n.getLanguage() === 'zh' ? '选择要导出的会话:' : 'Select session to export:',
          choices: sessions.map(s => ({
            name: `${s.title} (${formatDate(s.updatedAt)})`,
            value: s.id,
          })),
        },
      ]);

      await exportSession(selectedId);
      return;
    }

    const { selectedId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedId',
        message: i18n.t('prompts.selectSession'),
        choices: sessions.map(s => ({
          name: `${s.title} (${s.messageCount} ${i18n.t('session.messageCount').toLowerCase()}, ${formatDate(s.updatedAt)})`,
          value: s.id,
        })),
      },
    ]);

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: i18n.t('prompts.confirmResume'),
        default: true,
      },
    ]);

    if (confirm) {
      await launchSession(selectedId);
    }
  } finally {
    db.disconnect();
  }
}

async function launchSession(sessionId: string): Promise<void> {
  const session = db.getSession(sessionId);
  if (!session) {
    console.error(i18n.t('errors.sessionNotExist', { id: sessionId }));
    return;
  }

  const title = session.title || i18n.t('session.untitled');
  console.log(`\n${i18n.t('results.launchSuccess', { title })}`);
  console.log(`> opencode --session ${sessionId}\n`);

  const { execSync } = await import('child_process');
  try {
    execSync(`opencode --session ${sessionId}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(i18n.t('results.launchFailed'));
  }
}

async function resumeSession(sessionId: string): Promise<void> {
  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    process.exit(1);
  }

  try {
    const session = db.getSession(sessionId);
    if (!session) {
      console.error(i18n.t('errors.sessionNotExist', { id: sessionId }));
      process.exit(1);
    }

    const title = session.title || i18n.t('session.untitled');
    console.log(`${i18n.getLanguage() === 'zh' ? '继续会话' : 'Resuming session'}: ${title}`);
    await launchSession(sessionId);
  } finally {
    db.disconnect();
  }
}

async function exportSession(sessionId: string): Promise<void> {
  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    process.exit(1);
  }

  try {
    const { format } = await inquirer.prompt([
      {
        type: 'list',
        name: 'format',
        message: i18n.t('prompts.selectExportFormat'),
        choices: [
          { name: i18n.t('exportFormats.json'), value: 'json' },
          { name: i18n.t('exportFormats.markdown'), value: 'markdown' },
          { name: i18n.t('exportFormats.text'), value: 'text' },
        ],
      },
    ]);

    const exportData = db.exportSession(sessionId);
    if (!exportData) {
      console.error(i18n.t('errors.exportFailed'));
      return;
    }

    const session = db.getSession(sessionId);
    const filename = `session-${sessionId.substring(0, 8)}-${Date.now()}.${format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt'}`;
    const outputPath = path.join(process.cwd(), filename);

    let content: string;

    if (format === 'json') {
      content = JSON.stringify(exportData, null, 2);
    } else if (format === 'markdown') {
      content = formatAsMarkdown(exportData);
    } else {
      content = formatAsText(exportData);
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`\n${i18n.t('results.exportSuccess', { path: outputPath })}`);
  } finally {
    db.disconnect();
  }
}

function formatAsMarkdown(data: any): string {
  const { session, messages } = data;
  let md = `# ${session.title || i18n.t('session.untitled')}\n\n`;
  md += `- **${i18n.t('session.id')}**: ${session.id}\n`;
  md += `- **${i18n.t('session.createdAt')}**: ${new Date(session.time_created * 1000).toLocaleString()}\n`;
  md += `- **${i18n.t('session.updatedAt')}**: ${new Date(session.time_updated * 1000).toLocaleString()}\n`;
  md += `- **${i18n.t('session.messageCount')}**: ${session.message_count || messages.length}\n\n`;
  md += `---\n\n`;

  for (const msg of messages) {
    const role = msg.data?.role === 'user' ? 'User' : 'Assistant';
    md += `## ${role}\n\n`;

    for (const part of msg.parts) {
      if (part.type === 'text') {
        try {
          const textData = JSON.parse(part.data);
          md += `${textData.text}\n\n`;
        } catch {
          md += `${part.data}\n\n`;
        }
      } else if (part.type === 'tool-call') {
        try {
          const toolData = JSON.parse(part.data);
          md += `**Tool Call**: ${toolData.name}\n`;
          md += `\`\`\`json\n${JSON.stringify(toolData.arguments, null, 2)}\n\`\`\`\n\n`;
        } catch {
          // ignore parse error
        }
      }
    }
  }

  return md;
}

function formatAsText(data: any): string {
  const { session, messages } = data;
  let text = `${i18n.t('session.title')}: ${session.title || i18n.t('session.untitled')}\n`;
  text += `${i18n.t('session.id')}: ${session.id}\n`;
  text += `${i18n.t('session.createdAt')}: ${new Date(session.time_created * 1000).toLocaleString()}\n`;
  text += `${i18n.t('session.messageCount')}: ${session.message_count || messages.length}\n`;
  text += `${'='.repeat(50)}\n\n`;

  for (const msg of messages) {
    const role = msg.data?.role === 'user' ? 'USER' : 'ASSISTANT';
    text += `[${role}]\n`;

    for (const part of msg.parts) {
      if (part.type === 'text') {
        try {
          const textData = JSON.parse(part.data);
          text += `${textData.text}\n`;
        } catch {
          text += `${part.data}\n`;
        }
      }
    }
    text += '\n';
  }

  return text;
}

async function backupSessions(options: BackupOptions): Promise<void> {
  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    process.exit(1);
  }

  try {
    const backupDir = path.join(process.cwd(), 'opencode-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    let sessions;
    if (options.includeAll) {
      sessions = db.listSessions();
    } else if (options.sessionIds && options.sessionIds.length > 0) {
      sessions = options.sessionIds.map(id => db.getSession(id)).filter(Boolean);
    } else {
      console.log(i18n.getLanguage() === 'zh' ? '未指定要备份的会话' : 'No sessions specified for backup');
      return;
    }

    const backupFile = path.join(backupDir, `backup-${Date.now()}.json`);
    const backupData = {
      createdAt: new Date().toISOString(),
      sessions: sessions.map((s: any) => db.exportSession(s!.id)).filter(Boolean),
    };

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`\n${i18n.t('results.backupSuccess', { path: backupFile, count: String(backupData.sessions.length) })}`);
  } finally {
    db.disconnect();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'lang' || command === 'language') {
    await selectLanguage();
    return;
  }

  try {
    const configPath = path.join(require('os').homedir(), '.config', 'opencode', 'ocsm-lang.json');
    if (!fs.existsSync(configPath)) {
      await selectLanguage();
    }
  } catch {
    // ignore
  }

  switch (command) {
    case 'list':
      await listSessions();
      break;

    case 'select':
    case undefined:
      await selectSession();
      break;

    case 'resume':
      if (!args[1]) {
        console.error(i18n.t('errors.invalidSessionId'));
        process.exit(1);
      }
      await resumeSession(args[1]);
      break;

    case 'export':
      if (!args[1]) {
        console.error(i18n.t('errors.invalidSessionId'));
        process.exit(1);
      }
      await exportSession(args[1]);
      break;

    case 'backup':
      await backupSessions({
        includeAll: args.includes('--all'),
        sessionIds: args.slice(1).filter(a => !a.startsWith('--')),
        compress: args.includes('--compress'),
      });
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(`
OCSM - OpenCode Session Manager

${i18n.getLanguage() === 'zh' ? '用法' : 'Usage'}:
  ocsm [command] [options]

${i18n.getLanguage() === 'zh' ? '命令' : 'Commands'}:
  list                    ${i18n.t('cli.list')}
  select                  ${i18n.t('cli.select')}
  resume <session-id>     ${i18n.t('cli.resume')}
  export <session-id>     ${i18n.t('cli.exportCmd')}
  backup [options]        ${i18n.t('cli.backup')}
  lang                    ${i18n.getLanguage() === 'zh' ? '切换语言' : 'Switch language'}
  help                    ${i18n.t('cli.help')}

${i18n.getLanguage() === 'zh' ? '选项' : 'Options'}:
  --all                   ${i18n.t('tools.allParam')}
  --compress              ${i18n.getLanguage() === 'zh' ? '压缩备份文件' : 'Compress backup files'}

${i18n.getLanguage() === 'zh' ? '示例' : 'Examples'}:
  ocsm list
  ocsm select
  ocsm resume abc123
  ocsm export abc123
  ocsm backup --all
  ocsm lang
      `);
      break;

    default:
      console.error(i18n.t('errors.unknownCommand', { command }));
      console.log(i18n.getLanguage() === 'zh' ? '使用 "ocsm help" 查看帮助' : 'Use "ocsm help" for usage information');
      process.exit(1);
  }
}

main().catch(error => {
  console.error(i18n.t('common.error') + ':', error);
  process.exit(1);
});
