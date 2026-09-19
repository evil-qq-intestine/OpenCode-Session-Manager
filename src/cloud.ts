import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OpenCodeDB } from './db.js';
import { i18n } from './i18n.js';

export interface CodeRepoInfo {
  url: string;
  branch: string;
  commit: string;
}

export interface CloudSessionFile {
  version: string;
  session: any;
  messages: any[];
  code_repo?: CodeRepoInfo;
  exported_at: string;
  exported_by: string;
}

export interface CloudSessionPreview {
  id: string;
  title: string;
  messageCount: number;
  exportedAt: string;
  hasCodeRepo: boolean;
}

export class CloudManager {
  private configPath: string;
  private config: { username?: string; repo?: string } = {};

  constructor() {
    this.configPath = path.join(os.homedir(), '.config', 'opencode', 'ocsm-cloud.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      }
    } catch {
      this.config = {};
    }
  }

  saveConfig(config: { username?: string; repo?: string }): void {
    this.config = config;
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  getConfig(): { username?: string; repo?: string } {
    return { ...this.config };
  }

  checkGhCli(): { available: boolean; loggedIn: boolean; username?: string; error?: string } {
    try {
      const ghPath = execSync('which gh', { encoding: 'utf-8', stdio: 'pipe' }).trim();
      if (!ghPath) {
        return { available: false, loggedIn: false, error: 'gh CLI not found' };
      }
    } catch {
      return { available: false, loggedIn: false, error: 'gh CLI not installed' };
    }

    try {
      const whoami = execSync('gh auth status 2>&1', { encoding: 'utf-8', stdio: 'pipe' });
      const usernameMatch = whoami.match(/Logged in to github\.com as (\w+)/);
      const username = usernameMatch ? usernameMatch[1] : this.config.username;
      return { available: true, loggedIn: true, username };
    } catch (error: any) {
      const output = error.stdout || error.message;
      const usernameMatch = output.match(/Logged in to github\.com as (\w+)/);
      if (usernameMatch) {
        return { available: true, loggedIn: true, username: usernameMatch[1] };
      }
      return { available: true, loggedIn: false, error: 'Not logged in to gh CLI' };
    }
  }

  async createPrivateRepo(name: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const result = execSync(
        `gh repo create ${name} --private --description "OpenCode sessions backup" --json url`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      const data = JSON.parse(result);
      return { success: true, url: data.url };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async pushToRepo(repoUrl: string, localPath: string, message: string): Promise<{ success: boolean; error?: string }> {
    try {
      const tempDir = path.join(os.tmpdir(), `ocsm-push-${Date.now()}`);
      
      // Clone or init repo
      const repoName = this.extractRepoName(repoUrl);
      const authUrl = `https://github.com/${repoName}.git`;
      
      try {
        execSync(`git clone ${authUrl} "${tempDir}"`, { stdio: 'pipe' });
      } catch {
        fs.mkdirSync(tempDir, { recursive: true });
        execSync('git init', { cwd: tempDir, stdio: 'pipe' });
        execSync(`git remote add origin ${authUrl}`, { cwd: tempDir, stdio: 'pipe' });
      }

      // Copy file to repo
      const fileName = path.basename(localPath);
      fs.copyFileSync(localPath, path.join(tempDir, fileName));

      // Git add, commit, push
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync(`git commit -m "${message}"`, { cwd: tempDir, stdio: 'pipe' });
      execSync('git push -u origin main --force', { cwd: tempDir, stdio: 'pipe' });

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async pullFromRepo(repoUrl: string): Promise<{ success: boolean; files?: string[]; tempDir?: string; error?: string }> {
    try {
      const tempDir = path.join(os.tmpdir(), `ocsm-pull-${Date.now()}`);
      const repoName = this.extractRepoName(repoUrl);
      const authUrl = `https://github.com/${repoName}.git`;

      execSync(`git clone ${authUrl} "${tempDir}"`, { stdio: 'pipe' });

      const files = fs.readdirSync(tempDir)
        .filter(f => f.endsWith('.json') && !f.startsWith('.'))
        .map(f => path.join(tempDir, f));

      return { success: true, files, tempDir };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async listCloudSessions(repoUrl: string): Promise<{ success: boolean; sessions?: CloudSessionPreview[]; error?: string }> {
    const result = await this.pullFromRepo(repoUrl);
    if (!result.success || !result.files) {
      return { success: false, error: result.error };
    }

    const sessions: CloudSessionPreview[] = [];
    for (const file of result.files) {
      try {
        const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (content.session && content.messages) {
          sessions.push({
            id: content.session.id,
            title: content.session.title || 'Untitled',
            messageCount: content.messages.length,
            exportedAt: content.exported_at,
            hasCodeRepo: !!content.code_repo,
          });
        }
      } catch {}
    }

    // Cleanup temp dir
    if (result.tempDir) {
      fs.rmSync(result.tempDir, { recursive: true, force: true });
    }

    return { success: true, sessions };
  }

  async pushSession(sessionId: string, repoUrl?: string): Promise<{ success: boolean; repoUrl?: string; error?: string }> {
    const db = new OpenCodeDB();
    if (!db.connect()) {
      return { success: false, error: 'Database connection failed' };
    }

    try {
      const session = db.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const messages = db.getSessionMessages(sessionId);
      const messagesWithParts = messages.map((msg: any) => ({
        ...msg,
        parts: db.getMessageParts(msg.id),
      }));

      // Detect code repo
      let codeRepo: CodeRepoInfo | undefined;
      const sessionDir = session.directory || session.path;
      if (sessionDir) {
        codeRepo = this.detectCodeRepo(sessionDir);
      }

      const cloudFile: CloudSessionFile = {
        version: '1.0',
        session,
        messages: messagesWithParts,
        code_repo: codeRepo,
        exported_at: new Date().toISOString(),
        exported_by: `ocsm/${this.getVersion()}`,
      };

      // Write temp file
      const tempFile = path.join(os.tmpdir(), `ocsm-session-${sessionId.substring(0, 8)}-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(cloudFile, null, 2), 'utf-8');

      // Create repo if needed
      if (!repoUrl) {
        const repoName = this.config.repo || `opencode-sessions-${Date.now()}`;
        const createResult = await this.createPrivateRepo(repoName);
        if (!createResult.success) {
          fs.unlinkSync(tempFile);
          return { success: false, error: `Failed to create repo: ${createResult.error}` };
        }
        repoUrl = createResult.url;
      }

      // Push to repo
      const pushResult = await this.pushToRepo(
        repoUrl,
        tempFile,
        `Add session: ${session.title || sessionId}`
      );

      fs.unlinkSync(tempFile);

      if (!pushResult.success) {
        return { success: false, error: pushResult.error };
      }

      return { success: true, repoUrl };
    } finally {
      db.disconnect();
    }
  }

  async pullSession(sessionId: string, repoUrl: string): Promise<{ success: boolean; newSessionId?: string; codeRepo?: CodeRepoInfo; error?: string }> {
    const result = await this.pullFromRepo(repoUrl);
    if (!result.success || !result.files) {
      return { success: false, error: result.error };
    }

    const targetFile = result.files.find(f => {
      try {
        const content = JSON.parse(fs.readFileSync(f, 'utf-8'));
        return content.session?.id === sessionId;
      } catch {
        return false;
      }
    });

    if (!targetFile) {
      if (result.tempDir) {
        fs.rmSync(result.tempDir, { recursive: true, force: true });
      }
      return { success: false, error: 'Session not found in repo' };
    }

    const content = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    const codeRepo = content.code_repo;

    // Import session
    const { OpenCodeDBWrite } = await import('./db-write.js');
    const dbWrite = new OpenCodeDBWrite();
    if (!dbWrite.connect()) {
      if (result.tempDir) {
        fs.rmSync(result.tempDir, { recursive: true, force: true });
      }
      return { success: false, error: 'Database connection failed' };
    }

    try {
      const tempFile = path.join(os.tmpdir(), `ocsm-import-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(content, null, 2), 'utf-8');
      const newSessionId = dbWrite.importSession(tempFile);
      fs.unlinkSync(tempFile);

      if (result.tempDir) {
        fs.rmSync(result.tempDir, { recursive: true, force: true });
      }

      return { success: true, newSessionId, codeRepo };
    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      dbWrite.disconnect();
    }
  }

  cloneCodeRepo(codeRepo: CodeRepoInfo, targetDir?: string): { success: boolean; path?: string; error?: string } {
    try {
      const repoName = this.extractRepoName(codeRepo.url);
      const clonePath = targetDir || path.join(os.homedir(), 'projects', repoName.split('/').pop() || 'repo');
      
      if (fs.existsSync(clonePath)) {
        return { success: false, error: `Directory already exists: ${clonePath}` };
      }

      execSync(`git clone -b ${codeRepo.branch} ${codeRepo.url} "${clonePath}"`, { stdio: 'pipe' });
      
      if (codeRepo.commit) {
        try {
          execSync(`git checkout ${codeRepo.commit}`, { cwd: clonePath, stdio: 'pipe' });
        } catch {}
      }

      return { success: true, path: clonePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private detectCodeRepo(dir: string): CodeRepoInfo | undefined {
    let gitDir = dir;
    while (gitDir !== path.dirname(gitDir)) {
      if (fs.existsSync(path.join(gitDir, '.git'))) {
        break;
      }
      gitDir = path.dirname(gitDir);
    }

    if (!fs.existsSync(path.join(gitDir, '.git'))) {
      return undefined;
    }

    try {
      const remote = execSync('git remote get-url origin', { cwd: gitDir, encoding: 'utf-8', stdio: 'pipe' }).trim();
      if (!remote || !remote.includes('github.com')) {
        return undefined;
      }

      const branch = execSync('git branch --show-current', { cwd: gitDir, encoding: 'utf-8', stdio: 'pipe' }).trim();
      const commit = execSync('git rev-parse --short HEAD', { cwd: gitDir, encoding: 'utf-8', stdio: 'pipe' }).trim();

      const url = remote.replace(/\.git$/, '').replace('git@github.com:', 'https://github.com/');

      return { url, branch, commit };
    } catch {
      return undefined;
    }
  }

  private extractRepoName(repoUrl: string): string {
    const url = repoUrl.replace(/\.git$/, '');
    const match = url.match(/github\.com\/(.+?)(?:\/|$)/);
    return match ? match[1] : url;
  }

  private getVersion(): string {
    try {
      const pkgPath = path.join(__dirname, '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
