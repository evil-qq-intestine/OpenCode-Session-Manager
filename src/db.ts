import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Session, Message, Part, SessionPreview } from './types.js';

export class OpenCodeDB {
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
      this.db = new Database(this.dbPath, { readonly: true });
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

  listSessions(limit?: number, search?: string): any[] {
    let query = `
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s 
      WHERE s.parent_id IS NULL
    `;
    const params: any[] = [];

    if (search) {
      query += ' AND (s.title LIKE ? OR s.id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY s.time_created DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return this.db!.prepare(query).all(...params);
  }

  getSession(id: string): any | null {
    return this.db!.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s 
      WHERE s.id = ?
    `).get(id) || null;
  }

  getSessionMessages(sessionId: string, limit?: number): any[] {
    let query = 'SELECT * FROM message WHERE session_id = ? ORDER BY time_created ASC';
    const params: any[] = [sessionId];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return this.db!.prepare(query).all(...params);
  }

  getMessageParts(messageId: string): any[] {
    return this.db!.prepare('SELECT * FROM part WHERE message_id = ?').all(messageId);
  }

  searchSessionsByTitle(query: string): any[] {
    const searchTerm = `%${query}%`;
    return this.db!.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s
      WHERE s.parent_id IS NULL 
        AND (s.title LIKE ? OR s.id LIKE ?)
      ORDER BY s.time_created DESC
    `).all(searchTerm, searchTerm);
  }

  searchSessions(query: string): any[] {
    const searchTerm = `%${query}%`;
    return this.db!.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count
      FROM session s
      WHERE s.parent_id IS NULL 
        AND s.id IN (
          SELECT DISTINCT session_id FROM message WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT DISTINCT session_id FROM part WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT id FROM session WHERE id = s.id AND title LIKE ?
        )
      ORDER BY s.time_created DESC
    `).all(searchTerm, searchTerm, searchTerm);
  }

  searchSessionsWithRelevance(query: string): any[] {
    const searchTerm = `%${query}%`;
    return this.db!.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM message WHERE session_id = s.id) as message_count,
        CASE 
          WHEN s.title LIKE ? THEN 3
          WHEN s.id LIKE ? THEN 2
          ELSE 1
        END as relevance
      FROM session s
      WHERE s.parent_id IS NULL 
        AND s.id IN (
          SELECT DISTINCT session_id FROM message WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT DISTINCT session_id FROM part WHERE session_id = s.id AND data LIKE ?
          UNION
          SELECT id FROM session WHERE id = s.id AND title LIKE ?
        )
      ORDER BY relevance DESC, s.time_created DESC
    `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  getSessionsWithPreview(limit?: number): SessionPreview[] {
    const sessions = this.listSessions(limit);
    
    return sessions.map(session => {
      const messages = this.getSessionMessages(session.id, 1);
      let preview = '';
      
      if (messages.length > 0) {
        const parts = this.getMessageParts(messages[0].id);
        const textParts = parts.filter((p: any) => p.type === 'text');
        if (textParts.length > 0) {
          try {
            const data = JSON.parse(textParts[0].data);
            preview = (data.text || '').substring(0, 100);
          } catch {
            preview = textParts[0].data?.substring(0, 100) || '';
          }
        }
      }

      return {
        id: session.id,
        title: session.title || 'Untitled',
        messageCount: session.message_count || 0,
        createdAt: new Date(session.time_created * 1000),
        updatedAt: new Date(session.time_updated * 1000),
        preview,
      };
    });
  }

  exportSession(sessionId: string): any {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const messages = this.getSessionMessages(sessionId);
    const messagesWithParts = messages.map((msg: any) => ({
      ...msg,
      parts: this.getMessageParts(msg.id),
    }));

    return {
      session,
      messages: messagesWithParts,
      exportedAt: new Date().toISOString(),
    };
  }

  exportAllSessions(): any[] {
    const sessions = this.listSessions();
    return sessions.map((session: any) => this.exportSession(session.id)).filter(Boolean);
  }

  async exportSessionBundle(sessionId: string, outputPath: string): Promise<string> {
    const { execSync } = await import('child_process');
    
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    let sessionDir = session.directory || session.path;
    if (!sessionDir) {
      throw new Error('Session has no directory');
    }

    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Directory not found: ${sessionDir}`);
    }

    let gitDir = sessionDir;
    while (gitDir !== path.dirname(gitDir)) {
      if (fs.existsSync(path.join(gitDir, '.git'))) {
        break;
      }
      gitDir = path.dirname(gitDir);
    }

    if (!fs.existsSync(path.join(gitDir, '.git'))) {
      throw new Error('Session directory is not a Git repository');
    }

    const exportData = this.exportSession(sessionId);
    const baseName = outputPath || `session-${sessionId.substring(0, 8)}-${Date.now()}`;
    const bundlePath = `${baseName}.bundle`;
    const jsonPath = `${baseName}.json`;

    execSync(`git bundle create "${bundlePath}" --all`, {
      cwd: gitDir,
      stdio: 'pipe',
    });

    fs.writeFileSync(jsonPath, JSON.stringify(exportData, null, 2), 'utf-8');

    return bundlePath;
  }
}

export function getDBPath(): string {
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    return path.join(xdgData, 'opencode', 'opencode.db');
  }
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
}
