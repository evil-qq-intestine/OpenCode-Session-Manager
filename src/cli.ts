#!/usr/bin/env node

import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { OpenCodeDB } from './db.js';
import { OpenCodeDBWrite } from './db-write.js';
import { CloudManager } from './cloud.js';
import { SessionPreview } from './types.js';
import { i18n, Language, getAvailableLanguages } from './i18n.js';

const db = new OpenCodeDB();
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function formatDate(date: Date): string {
  return date.toLocaleString(i18n.getLanguage() === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, `${GREEN}$1${RESET}`);
}

function findOpenCode(): string | null {
  const candidates = ['opencode'];
  
  for (const cmd of candidates) {
    try {
      const result = execSync(`which ${cmd}`, { encoding: 'utf-8', stdio: 'pipe' });
      if (result.trim()) return result.trim();
    } catch {}
  }
  
  const commonPaths = [
    path.join(os.homedir(), '.local', 'bin', 'opencode'),
    path.join(os.homedir(), '.cargo', 'bin', 'opencode'),
    '/usr/local/bin/opencode',
    '/usr/bin/opencode',
  ];
  
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  
  return null;
}

async function selectLanguage(): Promise<void> {
  const languages = getAvailableLanguages();
  const languageNames: Record<string, string> = {
    zh: '中文',
    en: 'English',
  };

  const { language } = await inquirer.prompt([
    {
      type: 'list',
      name: 'language',
      message: 'Select language / 选择语言:',
      choices: languages.map(lang => ({
        name: languageNames[lang] || lang,
        value: lang,
      })),
    },
  ]);

  i18n.saveLanguage(language as Language);
  console.log(`\n${language === 'zh' ? '已选择中文' : 'Language set to ' + (languageNames[language] || language)}\n`);
}

function displaySessions(sessions: any[], query?: string): void {
  if (sessions.length === 0) {
    console.log(i18n.t('prompts.noSessionsFound'));
    return;
  }

  console.log(`\n=== ${i18n.t('results.sessionList')} ===\n`);
  sessions.forEach((session, index) => {
    const title = session.title || i18n.t('session.untitled');
    const displayTitle = query ? highlightMatch(title, query) : title;
    const preview = session.preview ? ` - ${session.preview.substring(0, 50)}...` : '';
    const dim = index % 2 !== 0 ? DIM : '';
    const reset = index % 2 !== 0 ? RESET : '';
    console.log(`${dim}[${index + 1}] ${displayTitle} (${session.messageCount || 0} ${i18n.t('session.messageCount').toLowerCase()}, ${formatDate(new Date((session.time_updated || session.updatedAt?.getTime() / 1000) * 1000))})${preview}${reset}`);
  });
}

async function listSessions(): Promise<void> {
  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    process.exit(1);
  }

  try {
    const sessions = db.getSessionsWithPreview(20);
    displaySessions(sessions);
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
    while (true) {
      const sessions = db.getSessionsWithPreview(50);

      if (sessions.length === 0) {
        console.log(i18n.t('prompts.noSessionsFound'));
        return;
      }

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          loop: false,
          message: i18n.t('prompts.selectAction'),
          choices: [
            { name: i18n.getLanguage() === 'zh' ? '选择会话继续' : 'Select session to resume', value: 'select' },
            { name: i18n.getLanguage() === 'zh' ? '搜索会话（仅标题）' : 'Search sessions (title only)', value: 'searchTitle' },
            { name: i18n.getLanguage() === 'zh' ? '搜索会话（全部内容）' : 'Search sessions (all content)', value: 'searchAll' },
            { name: i18n.getLanguage() === 'zh' ? '导出会话' : 'Export session', value: 'export' },
            { name: i18n.getLanguage() === 'zh' ? '导入会话' : 'Import session', value: 'import' },
            new inquirer.Separator(),
            { name: i18n.getLanguage() === 'zh' ? '云端推送' : 'Cloud push', value: 'cloudPush' },
            { name: i18n.getLanguage() === 'zh' ? '云端拉取' : 'Cloud pull', value: 'cloudPull' },
            new inquirer.Separator(),
            { name: i18n.t('cli.exit'), value: 'exit' },
          ],
        },
      ]);

      if (action === 'exit') {
        return;
      }

      if (action === 'searchTitle') {
        await searchSessions(true);
        continue;
      }

      if (action === 'searchAll') {
        await searchSessions(false);
        continue;
      }

      if (action === 'import') {
        const { filePath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'filePath',
            message: i18n.getLanguage() === 'zh' ? '输入导入文件路径:' : 'Enter import file path:',
          },
        ]);
        if (filePath) {
          await importSession(filePath);
        }
        continue;
      }

      if (action === 'cloudPush') {
        await cloudPush();
        continue;
      }

      if (action === 'cloudPull') {
        await cloudPull();
        continue;
      }

      const { selectedId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedId',
          loop: false,
          message: action === 'export'
            ? (i18n.getLanguage() === 'zh' ? '选择要导出的会话:' : 'Select session to export:')
            : i18n.t('prompts.selectSession'),
          choices: [
            ...sessions.map((s, i) => ({
              name: `${i % 2 === 0 ? '' : DIM}[${i + 1}] ${s.title} (${s.messageCount} ${i18n.t('session.messageCount').toLowerCase()}, ${formatDate(s.updatedAt)})${i % 2 === 0 ? '' : RESET}`,
              value: s.id,
            })),
            new inquirer.Separator(),
            { name: i18n.getLanguage() === 'zh' ? '返回' : 'Back', value: '__back__' },
          ],
        },
      ]);

      if (selectedId === '__back__') {
        continue;
      }

      if (action === 'export') {
        await exportSession(selectedId);
        continue;
      }

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
    }
  } finally {
    db.disconnect();
  }
}

async function searchSessions(titleOnly: boolean = false): Promise<void> {
  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    process.exit(1);
  }

  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const modeLabel = titleOnly 
      ? (i18n.getLanguage() === 'zh' ? '（仅标题）' : ' (title only)')
      : (i18n.getLanguage() === 'zh' ? '（全部内容）' : ' (all content)');
    
    process.stdout.write(`${i18n.t('prompts.searchQuery')}${modeLabel} `);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let query = '';
    let results: any[] = [];

    const displayResults = () => {
      process.stdout.write('\x1b[2J\x1b[H');
      process.stdout.write(`${i18n.t('prompts.searchQuery')}${modeLabel} ${query}\n`);
      if (query) {
        results = titleOnly 
          ? db.searchSessionsByTitle(query)
          : db.searchSessionsWithRelevance(query);
        if (results.length > 0) {
          console.log(`\n${i18n.getLanguage() === 'zh' ? '找到' : 'Found'} ${results.length} ${i18n.getLanguage() === 'zh' ? '个结果' : 'results'}:\n`);
          results.slice(0, 10).forEach((s, i) => {
            const title = highlightMatch(s.title || i18n.t('session.untitled'), query);
            const dim = i % 2 !== 0 ? DIM : '';
            const reset = i % 2 !== 0 ? RESET : '';
            console.log(`${dim}[${i + 1}] ${title} (${formatDate(new Date(s.time_updated * 1000))})${reset}`);
          });
        } else {
          console.log(`\n${i18n.t('prompts.noResultsFound')}`);
        }
      }
    };

    await new Promise<void>((resolve) => {
      const onData = (char: string) => {
        if (char === '\n' || char === '\r') {
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          rl.close();
          resolve();
        } else if (char === '\x7f' || char === '\b') {
          query = query.slice(0, -1);
          displayResults();
        } else if (char === '\x03') {
          process.exit(0);
        } else {
          query += char;
          displayResults();
        }
      };

      process.stdin.on('data', onData);
      displayResults();
    });

    if (!query.trim()) {
      return;
    }

    if (results.length === 0) {
      return;
    }

    const { selectedId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedId',
        loop: false,
        message: i18n.t('prompts.selectSession'),
        choices: [
          ...results.slice(0, 10).map((s, i) => ({
            name: `${i % 2 === 0 ? '' : DIM}${highlightMatch(s.title || i18n.t('session.untitled'), query)} (${formatDate(new Date(s.time_updated * 1000))})${i % 2 === 0 ? '' : RESET}`,
            value: s.id,
          })),
          new inquirer.Separator(),
          { name: i18n.getLanguage() === 'zh' ? '返回' : 'Back', value: '__back__' },
        ],
      },
    ]);

    if (selectedId === '__back__') {
      return;
    }

    await launchSession(selectedId);
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

  const opencodePath = findOpenCode();
  if (!opencodePath) {
    console.error(i18n.getLanguage() === 'zh' 
      ? '未找到 OpenCode。请确保已安装 OpenCode 并添加到 PATH。'
      : 'OpenCode not found. Make sure OpenCode is installed and in your PATH.');
    console.log(i18n.getLanguage() === 'zh'
      ? '你可以手动运行: opencode --session ' + sessionId
      : 'You can manually run: opencode --session ' + sessionId);
    return;
  }

  const title = session.title || i18n.t('session.untitled');
  console.log(`\n${i18n.t('results.launchSuccess', { title })}`);
  console.log(`> ${opencodePath} --session ${sessionId}\n`);

  try {
    execSync(`${opencodePath} --session ${sessionId}`, { stdio: 'inherit' });
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
  const { format } = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: i18n.t('prompts.selectExportFormat'),
      choices: [
        { name: i18n.t('exportFormats.json'), value: 'json' },
        { name: i18n.t('exportFormats.bundle'), value: 'bundle' },
        { name: i18n.t('exportFormats.markdown'), value: 'markdown' },
        { name: i18n.t('exportFormats.text'), value: 'text' },
      ],
    },
  ]);

  if (format === 'bundle') {
    try {
      const bundlePath = await db.exportSessionBundle(sessionId, '');
      console.log(`\n${i18n.t('results.exportSuccess', { path: bundlePath })}`);
      console.log(`${i18n.getLanguage() === 'zh' ? '会话数据' : 'Session data'}: ${bundlePath.replace('.bundle', '.json')}`);
    } catch (error: any) {
      console.error(error.message);
    }
    return;
  }

  const exportData = db.exportSession(sessionId);
  if (!exportData) {
    console.error(i18n.t('errors.exportFailed'));
    return;
  }

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
}

async function importSession(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(i18n.t('errors.importFileNotFound', { path: filePath }));
    return;
  }

  let data: any;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(content);
  } catch {
    console.error(i18n.t('errors.importInvalidJson'));
    return;
  }

  if (!data.session || !data.messages) {
    console.error(i18n.t('errors.importMissingSession'));
    return;
  }

  const title = data.session.title || i18n.t('session.untitled');
  const messageCount = data.messages.length;
  const createdAt = data.session.time_created
    ? new Date(data.session.time_created * 1000).toLocaleString()
    : i18n.getLanguage() === 'zh' ? '未知' : 'unknown';

  console.log(`\n${i18n.t('prompts.importPreview')}`);
  console.log(`  ${i18n.t('session.title')}: ${title}`);
  console.log(`  ${i18n.t('session.messageCount')}: ${messageCount}`);
  console.log(`  ${i18n.t('session.createdAt')}: ${createdAt}`);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: i18n.t('prompts.confirmImport'),
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(i18n.getLanguage() === 'zh' ? '已取消导入' : 'Import cancelled');
    return;
  }

  const dbWrite = new OpenCodeDBWrite();
  if (!dbWrite.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    return;
  }

  try {
    const newId = dbWrite.importSession(filePath);
    console.log(`\n${i18n.t('results.importSuccess', { id: newId })}`);
  } catch (error: any) {
    console.error(i18n.t('errors.importFailed'), error.message);
  } finally {
    dbWrite.disconnect();
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
        } catch {}
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

async function backupSessions(options: { includeAll: boolean; sessionIds?: string[] }): Promise<void> {
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

async function cloudPush(): Promise<void> {
  const cloud = new CloudManager();
  const ghStatus = cloud.checkGhCli();

  if (!ghStatus.available || !ghStatus.loggedIn) {
    console.error(i18n.t('results.cloudNoGhCli'));
    return;
  }

  if (!db.connect()) {
    console.error(i18n.t('errors.databaseConnectionFailed'));
    return;
  }

  try {
    const sessions = db.getSessionsWithPreview(50);
    if (sessions.length === 0) {
      console.log(i18n.t('prompts.noSessionsFound'));
      return;
    }

    const { selectedId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedId',
        loop: false,
        message: i18n.getLanguage() === 'zh' ? '选择要导出的会话:' : 'Select session to export:',
        choices: [
          ...sessions.map((s, i) => ({
            name: `${i % 2 === 0 ? '' : DIM}[${i + 1}] ${s.title} (${s.messageCount} messages, ${formatDate(s.updatedAt)})${i % 2 === 0 ? '' : RESET}`,
            value: s.id,
          })),
          new inquirer.Separator(),
          { name: i18n.getLanguage() === 'zh' ? '返回' : 'Back', value: '__back__' },
        ],
      },
    ]);

    if (selectedId === '__back__') {
      return;
    }

    const session = db.getSession(selectedId);
    const sessionDir = session?.directory || session?.path;

    // Check for child sessions
    const childSessions = db.getChildSessions(selectedId);
    let includeTree = true;

    if (childSessions.length > 0) {
      console.log(`\n${i18n.getLanguage() === 'zh' ? `检测到 ${childSessions.length} 个子会话` : `Detected ${childSessions.length} child sessions`}`);
      
      const { exportScope } = await inquirer.prompt([
        {
          type: 'list',
          name: 'exportScope',
          message: i18n.getLanguage() === 'zh' ? '选择导出范围:' : 'Select export scope:',
          choices: [
            { name: i18n.getLanguage() === 'zh' ? `仅当前会话 (1 个会话)` : `Current session only (1 session)`, value: 'single' },
            { name: i18n.getLanguage() === 'zh' ? `整个会话树 (${1 + childSessions.length} 个会话)` : `Full tree (${1 + childSessions.length} sessions)`, value: 'tree' },
          ],
        },
      ]);
      
      includeTree = exportScope === 'tree';
    }

    // Detect code repo
    let codeRepoInfo = '';
    if (sessionDir) {
      const tempCloud = new CloudManager();
      const codeRepo = (tempCloud as any).detectCodeRepo(sessionDir);
      if (codeRepo) {
        codeRepoInfo = i18n.t('results.cloudDetectCodeRepo', {
          repo: codeRepo.url,
          branch: codeRepo.branch,
          commit: codeRepo.commit,
        });
        console.log(`  ✓ ${codeRepoInfo}`);
      } else {
        console.log(`  ⚠ ${i18n.t('results.cloudNoCodeRepo')}`);
      }
    }

    // Get or create repo
    const config = cloud.getConfig();
    let repoUrl = config.repo;

    if (!repoUrl) {
      const { repoName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'repoName',
          message: i18n.t('prompts.enterRepoName'),
        },
      ]);

      if (repoName) {
        repoUrl = `https://github.com/${ghStatus.username}/${repoName}`;
      }
    }

    console.log(`\n${i18n.getLanguage() === 'zh' ? '正在导出会话...' : 'Exporting session...'}`);

    const result = await cloud.pushSession(selectedId, repoUrl, includeTree);

    if (result.success) {
      console.log(`\n✓ ${i18n.t('results.cloudPushSuccess', { repo: result.repoUrl || '' })}`);
    } else {
      console.error(`\n✗ ${i18n.t('results.cloudPushFailed')}: ${result.error}`);
    }
  } finally {
    db.disconnect();
  }
}

async function cloudPull(): Promise<void> {
  const cloud = new CloudManager();
  const ghStatus = cloud.checkGhCli();

  if (!ghStatus.available || !ghStatus.loggedIn) {
    console.error(i18n.t('results.cloudNoGhCli'));
    return;
  }

  const { repoUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'repoUrl',
      message: i18n.t('prompts.enterRepoUrl'),
    },
  ]);

  if (!repoUrl) {
    return;
  }

  console.log(`\n${i18n.getLanguage() === 'zh' ? '正在获取会话列表...' : 'Fetching session list...'}`);

  const result = await cloud.listCloudSessions(repoUrl);

  if (!result.success || !result.sessions || result.sessions.length === 0) {
    console.error(i18n.t('results.cloudListFailed'));
    return;
  }

  console.log(`\n${i18n.t('results.cloudListSuccess')}\n`);
  result.sessions.forEach((s, i) => {
    console.log(`[${i + 1}] ${s.title} (${s.messageCount} messages, exported ${s.exportedAt})${s.hasCodeRepo ? ' [code]' : ''}`);
  });

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      loop: false,
      message: i18n.t('prompts.selectCloudSession'),
      choices: [
        ...result.sessions.map((s, i) => ({
          name: `[${i + 1}] ${s.title} (${s.messageCount} messages)${s.hasCodeRepo ? ' [code]' : ''}`,
          value: s.id,
        })),
        new inquirer.Separator(),
        { name: i18n.getLanguage() === 'zh' ? '返回' : 'Back', value: '__back__' },
      ],
    },
  ]);

  if (selected === '__back__') {
    return;
  }

  console.log(`\n${i18n.getLanguage() === 'zh' ? '正在导入会话...' : 'Importing session...'}`);

  const pullResult = await cloud.pullSession(selected, repoUrl);

  if (pullResult.success) {
    console.log(`\n✓ ${i18n.t('results.cloudPullSuccess', { id: pullResult.newSessionId || '' })}`);

    // Check for code repo
    if (pullResult.codeRepo) {
      const { cloneCode } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'cloneCode',
          message: i18n.t('prompts.confirmCloneCode', { repo: pullResult.codeRepo.url }),
          default: false,
        },
      ]);

      if (cloneCode) {
        console.log(`\n${i18n.getLanguage() === 'zh' ? '正在 clone 代码...' : 'Cloning code...'}`);
        const cloneResult = cloud.cloneCodeRepo(pullResult.codeRepo);
        if (cloneResult.success) {
          console.log(`✓ ${i18n.t('results.cloudCloneSuccess', { path: cloneResult.path || '' })}`);
        } else {
          console.error(`✗ ${i18n.t('results.cloudCloneFailed')}: ${cloneResult.error}`);
        }
      }
    }
  } else {
    console.error(`\n✗ ${i18n.t('results.cloudPullFailed')}: ${pullResult.error}`);
  }
}

async function cloudList(): Promise<void> {
  const cloud = new CloudManager();
  const ghStatus = cloud.checkGhCli();

  if (!ghStatus.available || !ghStatus.loggedIn) {
    console.error(i18n.t('results.cloudNoGhCli'));
    return;
  }

  const { repoUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'repoUrl',
      message: i18n.t('prompts.enterRepoUrl'),
    },
  ]);

  if (!repoUrl) {
    return;
  }

  console.log(`\n${i18n.getLanguage() === 'zh' ? '正在获取会话列表...' : 'Fetching session list...'}`);

  const result = await cloud.listCloudSessions(repoUrl);

  if (!result.success || !result.sessions || result.sessions.length === 0) {
    console.error(i18n.t('results.cloudListFailed'));
    return;
  }

  console.log(`\n${i18n.t('results.cloudListSuccess')}\n`);
  result.sessions.forEach((s, i) => {
    console.log(`[${i + 1}] ${s.title} (${s.messageCount} messages, exported ${s.exportedAt})${s.hasCodeRepo ? ' [code]' : ''}`);
  });
}

async function cloudSetup(): Promise<void> {
  const cloud = new CloudManager();
  const ghStatus = cloud.checkGhCli();

  if (!ghStatus.available || !ghStatus.loggedIn) {
    console.error(i18n.t('results.cloudNoGhCli'));
    return;
  }

  const config = cloud.getConfig();

  const { username } = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: i18n.t('prompts.cloudSetupUsername'),
      default: ghStatus.username || config.username || '',
    },
  ]);

  const { repo } = await inquirer.prompt([
    {
      type: 'input',
      name: 'repo',
      message: i18n.t('prompts.cloudSetupRepo'),
      default: config.repo || '',
    },
  ]);

  cloud.saveConfig({ username, repo });
  console.log(`\n✓ ${i18n.t('results.cloudSetupSuccess')}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  const configPath = path.join(os.homedir(), '.config', 'opencode', 'ocsm-lang.json');
  if (!fs.existsSync(configPath) && command !== 'lang') {
    await selectLanguage();
  }

  switch (command) {
    case 'list':
      await listSessions();
      break;

    case 'select':
    case undefined:
      await selectSession();
      break;

    case 'search':
      await searchSessions();
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
      if (!db.connect()) {
        console.error(i18n.t('errors.databaseConnectionFailed'));
        process.exit(1);
      }
      try {
        await exportSession(args[1]);
      } finally {
        db.disconnect();
      }
      break;

    case 'import':
      if (!args[1]) {
        console.error(i18n.getLanguage() === 'zh' ? '请提供导入文件路径' : 'Please provide import file path');
        process.exit(1);
      }
      if (!db.connect()) {
        console.error(i18n.t('errors.databaseConnectionFailed'));
        process.exit(1);
      }
      try {
        await importSession(args[1]);
      } finally {
        db.disconnect();
      }
      break;

    case 'backup':
      await backupSessions({
        includeAll: args.includes('--all'),
        sessionIds: args.slice(1).filter(a => !a.startsWith('--')),
      });
      break;

    case 'cloud':
      const cloudAction = args[1] || 'help';
      switch (cloudAction) {
        case 'push':
          await cloudPush();
          break;
        case 'pull':
          await cloudPull();
          break;
        case 'list':
          await cloudList();
          break;
        case 'setup':
          await cloudSetup();
          break;
        default:
          console.log(`
${i18n.getLanguage() === 'zh' ? '云端同步命令' : 'Cloud sync commands'}:
  cloud push       ${i18n.t('cli.cloudPush')}
  cloud pull       ${i18n.t('cli.cloudPull')}
  cloud list       ${i18n.t('cli.cloudList')}
  cloud setup      ${i18n.t('cli.cloudSetup')}
          `);
      }
      break;

    case 'lang':
    case 'language':
      await selectLanguage();
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
  search                  ${i18n.getLanguage() === 'zh' ? '搜索会话' : 'Search sessions'}
  resume <session-id>     ${i18n.t('cli.resume')}
  export <session-id>     ${i18n.t('cli.exportCmd')}
  import <file>           ${i18n.t('cli.importCmd')}
  backup [options]        ${i18n.t('cli.backup')}
  cloud <action>          ${i18n.t('cli.cloud')}
  lang                    ${i18n.getLanguage() === 'zh' ? '切换语言' : 'Switch language'}
  help                    ${i18n.t('cli.help')}

${i18n.getLanguage() === 'zh' ? '选项' : 'Options'}:
  --all                   ${i18n.t('tools.allParam')}

${i18n.getLanguage() === 'zh' ? '示例' : 'Examples'}:
  ocsm list
  ocsm select
  ocsm search
  ocsm resume abc123
  ocsm export abc123
  ocsm backup --all
  ocsm cloud push
  ocsm cloud pull
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
