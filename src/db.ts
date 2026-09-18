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
    } catch (error) {
      console.error(`Failed to connect to database: ${error}`);
      return false;
    }
  }

  disconnect(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private ensureConnected(): void {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
  }

  listSessions(limit?: number, search?: string): any[] {
    this.ensureConnected();

    let query = 'SELECT * FROM session WHERE parent_id IS NULL';
    const params: any[] = [];

    if (search) {
      query += ' AND (title LIKE ? OR id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY time_created DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return this.db!.prepare(query).all(...params);
  }

  getSession(id: string): any | null {
    this.ensureConnected();
    return this.db!.prepare('SELECT * FROM session WHERE id = ?').get(id);
  }

  getSessionMessages(sessionId: string, limit?: number): any[] {
    this.ensureConnected();

    let query = 'SELECT * FROM message WHERE session_id = ? ORDER BY time_created ASC';
    const params: any[] = [sessionId];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    return this.db!.prepare(query).all(...params);
  }

  getMessageParts(messageId: string): any[] {
    this.ensureConnected();
    return this.db!.prepare('SELECT * FROM part WHERE message_id = ?').all(messageId);
  }

  searchSessions(query: string): any[] {
    this.ensureConnected();

    const searchQuery = `
      SELECT DISTINCT s.* 
      FROM session s
      LEFT JOIN session_message m ON s.id = m.session_id
      LEFT JOIN part p ON m.id = p.message_id
      WHERE s.parent_id IS NULL 
        AND (
          s.title LIKE ? 
          OR s.id LIKE ?
          OR m.data LIKE ?
          OR p.data LIKE ?
        )
      ORDER BY s.time_created DESC
    `;

    const searchTerm = `%${query}%`;
    return this.db!.prepare(searchQuery).all(
      searchTerm, searchTerm, searchTerm, searchTerm
    );
  }

  getSessionsWithPreview(limit?: number): SessionPreview[] {
    this.ensureConnected();

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

  deleteSession(id: string): boolean {
    this.ensureConnected();

    try {
      this.db!.prepare('DELETE FROM part WHERE session_id IN (SELECT id FROM session_message WHERE session_id = ?)').run(id);
      this.db!.prepare('DELETE FROM session_message WHERE session_id = ?').run(id);
      this.db!.prepare('DELETE FROM session WHERE id = ?').run(id);
      return true;
    } catch (error) {
      console.error(`Failed to delete session: ${error}`);
      return false;
    }
  }

  exportSession(sessionId: string): any {
    this.ensureConnected();

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
    this.ensureConnected();

    const sessions = this.listSessions();
    return sessions.map((session: any) => this.exportSession(session.id)).filter(Boolean);
  }
}

export function getDBPath(): string {
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    return path.join(xdgData, 'opencode', 'opencode.db');
  }
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
}
