import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomBytes } from 'crypto';

export class OpenCodeDBWrite {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || this.getDefaultDbPath();
  }

  private getDefaultDbPath(): string {
    const xdgData = process.env.XDG_DATA_HOME;
    if (xdgData) {
      return path.join(xdgData, 'opencode', 'opencode.db');
    }
    return path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  }

  connect(): boolean {
    if (!fs.existsSync(this.dbPath)) {
      console.error(`Database not found: ${this.dbPath}`);
      return false;
    }

    try {
      this.db = new Database(this.dbPath, { readonly: false });
      return true;
    } catch (error: any) {
      console.error(`Failed to connect to database: ${error.message}`);
      return false;
    }
  }

  disconnect(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private generateId(prefix: string): string {
    return prefix + randomBytes(12).toString('hex');
  }

  importSession(filePath: string): string {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let data: any;

    try {
      data = JSON.parse(content);
    } catch {
      throw new Error('Invalid JSON file');
    }

    if (!data.session || !data.messages) {
      throw new Error('JSON file missing session or messages data');
    }

    const newSessionId = this.generateId('ses_');
    const session = data.session;
    const now = Math.floor(Date.now() / 1000);

    this.db!.prepare(`
      INSERT INTO session (
        id, project_id, workspace_id, parent_id, slug, directory, path,
        title, version, share_url, summary_additions, summary_deletions,
        summary_files, summary_diffs, metadata, cost,
        tokens_input, tokens_output, tokens_reasoning,
        tokens_cache_read, tokens_cache_write, revert,
        permission, agent, model,
        time_created, time_updated, time_compacting, time_archived
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      newSessionId,
      'global',
      session.workspace_id || null,
      session.parent_id || null,
      session.slug || '',
      session.directory || '',
      session.path || null,
      session.title || 'Untitled',
      session.version || '',
      session.share_url || null,
      session.summary_additions || null,
      session.summary_deletions || null,
      session.summary_files || null,
      session.summary_diffs || null,
      session.metadata || null,
      session.cost || 0,
      session.tokens_input || 0,
      session.tokens_output || 0,
      session.tokens_reasoning || 0,
      session.tokens_cache_read || 0,
      session.tokens_cache_write || 0,
      session.revert || null,
      session.permission || null,
      session.agent || null,
      session.model || null,
      session.time_created || now,
      session.time_updated || now,
      session.time_compacting || null,
      session.time_archived || null,
    );

    for (const msg of data.messages) {
      const newMsgId = this.generateId('msg_');
      const parts = msg.parts || [];

      this.db!.prepare(`
        INSERT INTO message (id, session_id, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        newMsgId,
        newSessionId,
        msg.time_created || null,
        msg.time_updated || null,
        msg.data || null,
      );

      for (const part of parts) {
        const newPartId = this.generateId('prt_');
        this.db!.prepare(`
          INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          newPartId,
          newMsgId,
          newSessionId,
          part.time_created || null,
          part.time_updated || null,
          part.data || null,
        );
      }
    }

    return newSessionId;
  }
}
